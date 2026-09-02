using Opervia.Application.Connections;
using System.Threading.RateLimiting;
using Opervia.Api.Configuration;
using Opervia.Api.Filters;
using Opervia.Api.Infrastructure;
using Opervia.Application.Customers;
using Opervia.Application.DocumentItems;
using Opervia.Application.Documents;
using Opervia.Application.Flows;
using Opervia.Application.Receivables;
using Opervia.Application.Profitability;
using Opervia.Application.Inventory;
using Opervia.Application.Schema;
using Opervia.Application.Tables;
using Opervia.Infrastructure.Firebird;
using Opervia.Application.ArtificialIntelligence;
using Opervia.Infrastructure.ArtificialIntelligence;
using Opervia.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? [];

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddAuthorization();
builder.Services.AddDataProtection();
builder.Services.AddScoped<ValidateSaeConnectionTargetFilter>();
builder.Services
    .AddOptions<SaeConnectionSecurityOptions>()
    .BindConfiguration(SaeConnectionSecurityOptions.SectionName)
    .Validate(
        options => options.AllowedPorts.All(
            port => port is >= 1 and <= 65535
        ),
        "Todos los puertos permitidos deben estar entre 1 y 65535."
    )
    .ValidateOnStart();

builder.Services.AddControllers(options =>
{
    options.Filters.AddService<ValidateSaeConnectionTargetFilter>();
});
builder.Services.AddOpenApi();
builder.Services.AddOptions<OpenAiOptions>()
    .BindConfiguration(OpenAiOptions.SectionName);
builder.Services.AddOptions<OllamaOptions>()
    .BindConfiguration(OllamaOptions.SectionName);
builder.Services.AddHttpClient<IOperviaAiAssistant, OllamaOperviaAssistant>(
    client => client.Timeout = TimeSpan.FromMinutes(3));
builder.Services.AddOptions<MySqlStorageOptions>()
    .BindConfiguration(MySqlStorageOptions.SectionName);
builder.Services.AddScoped<
    ISaeConnectionProfileStore,
    MySqlSaeConnectionProfileStore>();
builder.Services.AddScoped<
    IManualProfitabilityStore,
    MySqlManualProfitabilityStore>();

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode =
        StatusCodes.Status429TooManyRequests;

    options.AddPolicy(
        "SaeApi",
        httpContext => RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString()
                ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 60,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }
        )
    );
});

builder.Services.AddCors(options =>
{
    options.AddPolicy(
        "OperviaWeb",
        policy =>
        {
            policy.AllowAnyHeader()
                .AllowAnyMethod();

            if (allowedOrigins.Length > 0)
            {
                policy.WithOrigins(allowedOrigins);
            }
        }
    );
});

builder.Services.AddScoped<
    ISaeConnectionTester,
    FirebirdSaeConnectionTester
>();

builder.Services.AddScoped<
    ISaeSchemaInspector,
    FirebirdSaeSchemaInspector
>();

builder.Services.AddScoped<
    ISaeTableStructureInspector,
    FirebirdSaeTableStructureInspector
>();

builder.Services.AddScoped<
    ISaeDocumentProbe,
    FirebirdSaeDocumentProbe
>();

builder.Services.AddScoped<
    ISaeDocumentLookup,
    FirebirdSaeDocumentLookup
>();

builder.Services.AddScoped<
    ISaeSalesFlowBuilder,
    SaeSalesFlowBuilder
>();

builder.Services.AddScoped<
    ISaeSalesFlowSummaryProbe,
    FirebirdSaeSalesFlowSummaryProbe
>();

builder.Services.AddScoped<
    ISaeDocumentItemsReader,
    FirebirdSaeDocumentItemsReader
>();

builder.Services.AddScoped<
    ISaeCustomerLookup,
    FirebirdSaeCustomerLookup
>();

builder.Services.AddScoped<
    ISaeReceivableProbe,
    FirebirdSaeReceivableProbe
>();

builder.Services.AddScoped<
    ISaeReceivableRootProbe,
    FirebirdSaeReceivableRootProbe
>();

builder.Services.AddScoped<
    ISaeCustomerReceivableMovementsProbe,
    FirebirdSaeCustomerReceivableMovementsProbe
>();

builder.Services.AddScoped<
    ISaeReceivablesSummaryProbe,
    FirebirdSaeReceivablesSummaryProbe
>();

builder.Services.AddScoped<
    ISaeProfitabilityProbe,
    FirebirdSaeProfitabilityProbe
>();

builder.Services.AddScoped<
    ISaeInventoryAnalyticsProbe,
    FirebirdSaeInventoryAnalyticsProbe
>();

builder.Services.AddScoped<
    IOperviaAiEvidenceProbe,
    FirebirdOperviaAiEvidenceProbe
>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseExceptionHandler();

app.Use(async (context, next) =>
{
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers.XFrameOptions = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers.CacheControl = "no-store";

    await next();
});

app.UseHttpsRedirection();

app.UseCors("OperviaWeb");

app.UseRateLimiter();

app.UseAuthorization();

app.MapControllers()
    .RequireRateLimiting("SaeApi");

app.Run();
