using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Opervia.Api.Contracts.Connections;
using Opervia.Application.Connections;

namespace Opervia.Api.Filters;

public sealed class AccessFilter(ISaeConnectionProfileStore connections) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var http = context.HttpContext;
        if (http.User.Identity?.IsAuthenticated != true) { await next(); return; }
        var path = (http.Request.Path.Value ?? "").TrimEnd('/').ToLowerInvariant();
        var admin = http.User.IsInRole("Administrador");
        var executive = http.User.IsInRole("Ejecutivo");
        var allowedForExecutive = path.StartsWith("/api/access/") || path == "/api/connections/last-used" || path == "/api/sae/company" ||
            path.StartsWith("/api/sae/commercial") || path == "/api/sae/customers/portfolio" || path == "/api/sae/collections/control" ||
            path.StartsWith("/api/sae/sales-flow") || path.StartsWith("/api/sae/document-items/") ||
            path == "/api/sae/receivables/summary" || path == "/api/sae/receivables/invoices" ||
            path.StartsWith("/api/sae/receivables/invoice-account/");
        if ((!admin && (path.StartsWith("/api/connections") && path != "/api/connections/last-used" ||
                path.StartsWith("/api/sae/connections"))) || executive && !allowedForExecutive)
        { context.Result = new ObjectResult(new { message = "Tu cuenta no tiene acceso a esta función." }) { StatusCode = 403 }; return; }
        // Non-admin accounts always use the administrator's saved connection, even if the body is tampered with.
        if (!admin)
        {
            var arguments = context.ActionArguments.Where(a => a.Value is TestSaeConnectionRequest).Select(a => a.Key).ToArray();
            if (arguments.Length > 0)
            {
                var saved = await connections.GetLastUsedAsync(http.RequestAborted);
                if (saved is null) { context.Result = new ObjectResult(new { message = "El administrador debe configurar la conexión SAE." }) { StatusCode = 409 }; return; }
                foreach (var key in arguments) context.ActionArguments[key] = new TestSaeConnectionRequest {
                    DisplayName = saved.DisplayName, Host = saved.Host, Port = saved.Port, Database = saved.Database,
                    Username = saved.Username, Password = saved.Password, CompanyNumber = saved.CompanyNumber,
                    SaeVersion = saved.SaeVersion, Charset = saved.Charset
                };
            }
        }
        await next();
    }
}
