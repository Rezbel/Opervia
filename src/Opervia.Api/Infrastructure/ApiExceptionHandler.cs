using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Opervia.Api.Infrastructure;

public sealed class ApiExceptionHandler(
    ILogger<ApiExceptionHandler> logger
) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken
    )
    {
        if (exception is OperationCanceledException &&
            httpContext.RequestAborted.IsCancellationRequested)
        {
            return false;
        }

        var isClientError = exception is ArgumentException;
        var statusCode = isClientError
            ? StatusCodes.Status400BadRequest
            : StatusCodes.Status500InternalServerError;

        if (isClientError)
        {
            logger.LogWarning(
                exception,
                "La API rechazó una solicitud inválida en {Path}.",
                httpContext.Request.Path
            );
        }
        else
        {
            logger.LogError(
                exception,
                "Error no controlado en {Path}.",
                httpContext.Request.Path
            );
        }

        var problem = new ProblemDetails
        {
            Status = statusCode,
            Title = isClientError
                ? "Solicitud inválida"
                : "No fue posible completar la operación",
            Detail = isClientError
                ? exception.Message
                : "Ocurrió un error interno. Consulta los registros del servidor."
        };

        httpContext.Response.StatusCode = statusCode;

        await httpContext.Response.WriteAsJsonAsync(
            problem,
            cancellationToken
        );

        return true;
    }
}
