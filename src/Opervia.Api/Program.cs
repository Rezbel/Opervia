using Opervia.Application.Reporting;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using Opervia.Application.Access;
using Opervia.Application.Connections;
using System.Threading.RateLimiting;
using Opervia.Api.Configuration;
using Opervia.Api.Filters;
using Opervia.Api.Infrastructure;
using Opervia.Application.Customers;
using Opervia.Application.Collections;
using Opervia.Application.DocumentItems;
using Opervia.Application.Documents;
using Opervia.Application.Flows;
using Opervia.Application.Receivables;
using Opervia.Application.Profitability;
using Opervia.Application.Inventory;
using Opervia.Application.Commercial;
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
builder.Services.AddSingleton<AccessStore>();
builder.Services.AddScoped<FirebirdAccessCatalog>();
builder.Services.AddScoped<FirebirdCompanyReader>();
builder.Services.AddScoped<ISaeCollectionsControlProbe, FirebirdSaeCollectionsControlProbe>();
builder.Services.AddScoped<AccessFilter>();
builder.Services.AddAuthentication("Cookies").AddCookie("Cookies", options => {
    options.Cookie.Name = "Opervia.Session";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    options.ExpireTimeSpan = TimeSpan.FromDays(30);
    options.SlidingExpiration = true;
    options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
    options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
    options.Events.OnValidatePrincipal = async context => {
        var store = context.HttpContext.RequestServices.GetRequiredService<AccessStore>();
        var user = Guid.TryParse(context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? await store.FindAsync(id) : null;
        if (user is null || !user.Active || context.Principal?.FindFirstValue("version") != user.Version.ToString()) {
            context.RejectPrincipal();
            await Microsoft.AspNetCore.Authentication.AuthenticationHttpContextExtensions.SignOutAsync(context.HttpContext, "Cookies");
        }
    };
});
builder.Services.AddAuthorization(options => options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
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
    options.Filters.AddService<AccessFilter>(-3000);
    options.Filters.AddService<ValidateSaeConnectionTargetFilter>(-2500);
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
if (builder.Environment.IsDevelopment() &&
    string.IsNullOrWhiteSpace(builder.Configuration[$"{MySqlStorageOptions.SectionName}:ConnectionString"]))
{
    builder.Services.AddSingleton<LocalDevelopmentStore>();
    builder.Services.AddSingleton<ISaeConnectionProfileStore>(sp => sp.GetRequiredService<LocalDevelopmentStore>());
    builder.Services.AddSingleton<IManualProfitabilityStore>(sp => sp.GetRequiredService<LocalDevelopmentStore>());
}
else
{
    builder.Services.AddScoped<ISaeConnectionProfileStore, MySqlSaeConnectionProfileStore>();
    builder.Services.AddScoped<IManualProfitabilityStore, MySqlManualProfitabilityStore>();
}
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode =
        StatusCodes.Status429TooManyRequests;

    options.AddPolicy(
        "SaeApi",
        httpContext => RateLimitPartition.GetFixedWindowLimiter(
            (httpContext.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "anonymous") + ":" +
                (httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
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
                .AllowAnyMethod().AllowCredentials();

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

builder.Services.AddScoped<ISaeDocumentLinksReader, FirebirdSaeDocumentLinksReader>();

builder.Services.AddScoped<
    ISaeSalesFlowBuilder,
    SaeSalesGraphBuilder
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
    ISaeCustomerPortfolioProbe,
    FirebirdSaeCustomerPortfolioProbe
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
builder.Services.AddScoped<ISaeReceivableInvoiceListingProbe, FirebirdSaeReceivableInvoiceListingProbe>();
builder.Services.AddScoped<ISaeReceivableInvoiceAccountProbe, FirebirdSaeReceivableInvoiceAccountProbe>();

builder.Services.AddScoped<
    ISaeProfitabilityProbe,
    FirebirdSaeProfitabilityProbe
>();

builder.Services.AddScoped<
    ISaeInventoryAnalyticsProbe,
    FirebirdSaeInventoryAnalyticsProbe
>();

builder.Services.AddScoped<
    ISaeCommercialProbe,
    FirebirdSaeCommercialProbe
>();

builder.Services.AddScoped<
    IOperviaAiEvidenceProbe,
    FirebirdOperviaAiEvidenceProbe
>();

var app = builder.Build();
_ = app.Services.GetRequiredService<AccessStore>();

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

if (!app.Environment.IsDevelopment()) app.UseHttpsRedirection();

app.UseCors("OperviaWeb");

app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();
app.Use(async (context, next) => {
    var origin = context.Request.Headers.Origin.ToString();
    if (context.Request.Method != "GET" && !string.IsNullOrEmpty(origin) && !allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase)
        && origin != $"{context.Request.Scheme}://{context.Request.Host}") {
        context.Response.StatusCode = 403; await context.Response.WriteAsJsonAsync(new { message = "Origen no autorizado." }); return;
    }
    var executive = context.User.IsInRole("Ejecutivo");
    var sellers = executive ? context.User.FindAll("seller").Select(c => c.Value).ToArray() : null;
    var selected = context.Request.Headers["X-Opervia-Seller"].ToString().Trim();
    var querySeller = context.Request.Query["seller"].ToString().Trim();
    if (executive && (!string.IsNullOrEmpty(selected) && FilterSelection.Values(selected).Any(code => !sellers!.Contains(code, StringComparer.OrdinalIgnoreCase))
        || !string.IsNullOrEmpty(querySeller) && FilterSelection.Values(querySeller).Any(code => !sellers!.Contains(code, StringComparer.OrdinalIgnoreCase)))) {
        context.Response.StatusCode = 403; await context.Response.WriteAsJsonAsync(new { message = "La clave de vendedor no está asignada a tu cuenta." }); return;
    }
    if (executive && !string.IsNullOrEmpty(selected)) sellers = FilterSelection.Values(selected);
    SellerAccessScope.Sellers = sellers;
    try { await next(); } finally { SellerAccessScope.Sellers = null; }
});

app.MapGet("/api/health", () => Results.Ok(new { status = "ready" })).AllowAnonymous();
app.MapControllers()
    .RequireRateLimiting("SaeApi");

app.Run();





