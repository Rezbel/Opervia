using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Options;
using Opervia.Api.Configuration;
using Opervia.Api.Contracts.Connections;

namespace Opervia.Api.Filters;

public sealed class ValidateSaeConnectionTargetFilter(
    IOptions<SaeConnectionSecurityOptions> options,
    IHostEnvironment environment
) : IAsyncActionFilter
{
    private readonly SaeConnectionSecurityOptions _options =
        options.Value;

    public async Task OnActionExecutionAsync(
        ActionExecutingContext context,
        ActionExecutionDelegate next
    )
    {
        var request = context.ActionArguments.Values
            .OfType<TestSaeConnectionRequest>()
            .FirstOrDefault();

        if (request is null || IsAllowed(request, environment))
        {
            await next();
            return;
        }

        context.Result = new ObjectResult(
            new ProblemDetails
            {
                Status = StatusCodes.Status403Forbidden,
                Title = "Destino Firebird no autorizado",
                Detail =
                    "El servidor o puerto solicitado no está permitido por la configuración de Opervia."
            }
        )
        {
            StatusCode = StatusCodes.Status403Forbidden
        };
    }

    private bool IsAllowed(
        TestSaeConnectionRequest request,
        IHostEnvironment environment
    )
    {
        if (environment.IsDevelopment() &&
            _options.AllowArbitraryTargetsInDevelopment)
        {
            return true;
        }

        var requestedHost = request.Host?.Trim();
        var hostIsAllowed =
            !string.IsNullOrWhiteSpace(requestedHost) &&
            _options.AllowedHosts.Any(
                allowedHost => string.Equals(
                    allowedHost?.Trim(),
                    requestedHost,
                    StringComparison.OrdinalIgnoreCase
                )
            );

        var portIsAllowed =
            _options.AllowedPorts.Contains(request.Port);

        return hostIsAllowed && portIsAllowed;
    }
}
