using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Opervia.Api.Infrastructure;
using Opervia.Application.Connections;
using Opervia.Infrastructure.Firebird;

namespace Opervia.Api.Controllers;

[ApiController, Route("api/access")]
public sealed class AccessController(AccessStore store, ISaeConnectionProfileStore connections, FirebirdAccessCatalog catalog) : ControllerBase
{
    public sealed record LoginRequest(string Email, string Password, bool RememberMe);
    public sealed record UserRequest(string Name, string Email, string Role, string[] SellerCodes, bool Active, string? Password);
    [AllowAnonymous, HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrEmpty(request.Password) || request.Password.Length > 128)
            return BadRequest(new { message = "Indica tu correo y contraseña." });
        var user = await store.AuthenticateAsync(request.Email, request.Password);
        if (user is null) return Unauthorized(new { message = "Correo o contraseña incorrectos, o cuenta inactiva." });
        await HttpContext.SignInAsync("Cookies", AccessStore.Principal(user), new AuthenticationProperties {
            IsPersistent = request.RememberMe, ExpiresUtc = DateTimeOffset.UtcNow.Add(request.RememberMe ? TimeSpan.FromDays(30) : TimeSpan.FromHours(8)),
            AllowRefresh = true
        });
        return Ok(AccessStore.View(user));
    }
    [HttpGet("me")]
    public async Task<IActionResult> Me() => Ok(AccessStore.View((await store.FindAsync(Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!)))!));
    [HttpPost("logout")]
    public async Task<IActionResult> Logout() { await HttpContext.SignOutAsync("Cookies"); return NoContent(); }
    [Authorize(Roles = "Administrador,Gerencia"), HttpGet("users")]
    public async Task<IActionResult> List() => Ok(await store.ListAsync());
    [Authorize(Roles = "Administrador,Gerencia"), HttpGet("sellers")]
    public async Task<IActionResult> Sellers(CancellationToken token)
    {
        var connection = await connections.GetLastUsedAsync(token);
        if (connection is null) return Conflict(new { message = "El administrador debe configurar SAE antes de asignar vendedores." });
        return Ok(await catalog.SellersAsync(connection, token));
    }
    [Authorize(Roles = "Administrador,Gerencia"), HttpPost("users")]
    public Task<IActionResult> Create(UserRequest request, CancellationToken token) => Save(null, request, token);
    [HttpGet("seller-descriptions")]
    public async Task<IActionResult> SellerDescriptions(CancellationToken token)
    {
        var connection = await connections.GetLastUsedAsync(token);
        if (connection is null) return Conflict(new { message = "Configura la conexión a SAE para consultar los vendedores." });
        var sellers = await catalog.SellersAsync(connection, token);
        // Names for every assigned key stay available in the executive selector, even when one key is selected.
        // The scope comes from authenticated claims; no unassigned catalog names are returned.
        if (User.IsInRole("Ejecutivo"))
        {
            var allowed = User.FindAll("seller").Select(claim => claim.Value.Trim()).ToHashSet(StringComparer.OrdinalIgnoreCase);
            sellers = sellers.Where(seller => allowed.Contains(seller.Value)).ToArray();
        }
        return Ok(sellers);
    }
    [Authorize(Roles = "Administrador,Gerencia"), HttpPut("users/{id:guid}")]
    public Task<IActionResult> Update(Guid id, UserRequest request, CancellationToken token) => Save(id, request, token);
    private async Task<IActionResult> Save(Guid? id, UserRequest request, CancellationToken token)
    {
        try
        {
            if (request.Role == "Ejecutivo")
            {
                var connection = await connections.GetLastUsedAsync(token);
                if (connection is null) return Conflict(new { message = "Primero configura SAE." });
                var sellers = await catalog.SellersAsync(connection, token);
                if (request.SellerCodes is null || request.SellerCodes.Any(code => string.IsNullOrWhiteSpace(code) || !sellers.Any(s => s.Value.Equals(code.Trim(), StringComparison.OrdinalIgnoreCase))))
                    return BadRequest(new { message = "Selecciona claves de vendedor existentes en SAE." });
            }
            return Ok(await store.UpsertAsync(id, request.Name ?? "", request.Email ?? "", request.Role,
                request.SellerCodes ?? [], request.Active, string.IsNullOrEmpty(request.Password) ? null : request.Password, User.IsInRole("Administrador")));
        }
        catch (ArgumentException e) { return BadRequest(new { message = e.Message }); }
        catch (UnauthorizedAccessException) { return StatusCode(403, new { message = "Solo un administrador puede administrar cuentas de administrador." }); }
    }
}
