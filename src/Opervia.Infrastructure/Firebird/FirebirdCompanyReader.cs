using System.Xml;
using System.Xml.Linq;
using FirebirdSql.Data.FirebirdClient;
using Opervia.Application.Connections;
using Opervia.Domain.Connections;

namespace Opervia.Infrastructure.Firebird;

public sealed record SaeCompanyIdentity(bool Connected, string? Name);

public sealed class FirebirdCompanyReader(ILogger<FirebirdCompanyReader> logger)
{
    public async Task<SaeCompanyIdentity> ReadAsync(SavedSaeConnectionProfile saved, CancellationToken token)
    {
        var profile = new SaeConnectionProfile {
            DisplayName = saved.DisplayName, Host = saved.Host, Port = saved.Port,
            Database = saved.Database, Username = saved.Username, CompanyNumber = saved.CompanyNumber,
            SaeVersion = saved.SaeVersion, Charset = saved.Charset
        };
        try {
            await using var connection = FirebirdConnectionFactory.Create(profile, saved.Password);
            await connection.OpenAsync(token);
            await using var company = new FbCommand($"SELECT FIRST 1 NOMBRE_EMPRESA FROM {profile.ResolveTableName("PARAM_DATOSEMP")} WHERE NUM_EMP = @COMPANY", connection) { CommandTimeout = 10 };
            company.Parameters.AddWithValue("@COMPANY", int.Parse(saved.CompanyNumber));
            var name = (await company.ExecuteScalarAsync(token))?.ToString()?.Trim();
            // SAE may encode this configuration field. Never display its encoded value
            // or substitute the user-defined connection alias for the legal name.
            if (!string.IsNullOrWhiteSpace(name) && !(name.Length >= 16 && name.All(Uri.IsHexDigit)))
                return new(true, name);

            await using var invoices = new FbCommand($"""
                SELECT FIRST 3 C.XML_DOC
                FROM {profile.ResolveTableName("CFDI")} C
                INNER JOIN {profile.ResolveTableName("FACTF")} F ON F.CVE_DOC = C.CVE_DOC
                WHERE C.TIPO_DOC = 'F' AND C.XML_DOC IS NOT NULL
                ORDER BY C.FECHA_CERT DESC, C.CVE_DOC DESC
                """, connection) { CommandTimeout = 10 };
            await using var reader = await invoices.ExecuteReaderAsync(token);
            while (await reader.ReadAsync(token)) {
                try {
                    using var text = new StringReader(reader.GetString(0));
                    using var xml = XmlReader.Create(text, new XmlReaderSettings {
                        DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 4_000_000
                    });
                    var document = XDocument.Load(xml);
                    var issuer = document.Root?.Elements().FirstOrDefault(element => element.Name.LocalName == "Emisor");
                    name = issuer?.Attributes().FirstOrDefault(attribute => attribute.Name.LocalName.Equals("Nombre", StringComparison.OrdinalIgnoreCase))?.Value.Trim();
                    if (!string.IsNullOrWhiteSpace(name)) return new(true, name);
                } catch (XmlException) { /* Try the next stored invoice if its XML is damaged. */ }
            }
            return new(true, null);
        } catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
        catch (Exception exception) {
            logger.LogWarning(exception, "No fue posible consultar la identidad de la empresa SAE.");
            return new(false, null);
        }
    }
}
