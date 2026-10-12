using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;

namespace Opervia.Api.Infrastructure;

public sealed record AccessUser(Guid Id, string Name, string Email, string Role, string[] SellerCodes,
    bool Active, string PasswordHash, int Version);
public sealed record AccessUserView(Guid Id, string Name, string Email, string Role, string[] SellerCodes, bool Active);

public sealed class AccessStore
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly string path;
    private readonly PasswordHasher<AccessUser> hasher = new();
    private List<AccessUser> users;
    public static readonly string[] Roles = ["Administrador", "Gerencia", "Ejecutivo"];
    public AccessStore(IHostEnvironment environment, IConfiguration configuration)
    {
        var directory = Path.Combine(environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(directory);
        path = Path.Combine(directory, "users.json");
        users = File.Exists(path) ? JsonSerializer.Deserialize<List<AccessUser>>(File.ReadAllText(path)) ?? [] : [];
        if (users.Count == 0)
        {
            var seedPath = Path.Combine(directory, "bootstrap-admin.json");
            var password = configuration["Auth:BootstrapPassword"];
            if (string.IsNullOrEmpty(password) && File.Exists(seedPath))
                password = JsonDocument.Parse(File.ReadAllText(seedPath)).RootElement.GetProperty("password").GetString();
            if (string.IsNullOrEmpty(password)) throw new InvalidOperationException("Configura Auth:BootstrapPassword para crear el administrador inicial.");
            var user = new AccessUser(Guid.NewGuid(), "Sistemas", "sistemas@qrq.com.mx", "Administrador", [], true, "", 1);
            users.Add(user with { PasswordHash = hasher.HashPassword(user, password) });
            File.WriteAllText(path, JsonSerializer.Serialize(users));
            if (File.Exists(seedPath)) File.Delete(seedPath);
        }
    }
    public static AccessUserView View(AccessUser user) => new(user.Id, user.Name, user.Email, user.Role, user.SellerCodes, user.Active);
    public async Task<AccessUser?> FindAsync(Guid id)
    {
        await gate.WaitAsync(); try { return users.FirstOrDefault(u => u.Id == id); } finally { gate.Release(); }
    }
    public async Task<AccessUser?> AuthenticateAsync(string email, string password)
    {
        await gate.WaitAsync();
        try
        {
            var user = users.FirstOrDefault(u => u.Email.Equals(email.Trim(), StringComparison.OrdinalIgnoreCase));
            // Use a real hash even for unknown accounts to avoid skipping password verification.
            var candidate = user ?? users[0];
            var verified = hasher.VerifyHashedPassword(candidate, candidate.PasswordHash, password);
            if (user is null || !user.Active || verified == PasswordVerificationResult.Failed) return null;
            if (verified == PasswordVerificationResult.SuccessRehashNeeded)
            {
                user = user with { PasswordHash = hasher.HashPassword(user, password) };
                users[users.FindIndex(u => u.Id == user.Id)] = user; await SaveAsync();
            }
            return user;
        }
        finally { gate.Release(); }
    }
    public async Task<AccessUserView[]> ListAsync()
    { await gate.WaitAsync(); try { return users.Select(View).ToArray(); } finally { gate.Release(); } }
    public async Task<AccessUserView> UpsertAsync(Guid? id, string name, string email, string role, string[] sellerCodes, bool active, string? password, bool administrator)
    {
        await gate.WaitAsync();
        try
        {
            var current = id.HasValue ? users.FirstOrDefault(u => u.Id == id) ?? throw new ArgumentException("El usuario no existe.") : null;
            if (!administrator && (role == "Administrador" || current?.Role == "Administrador")) throw new UnauthorizedAccessException();
            if (!Roles.Contains(role) || string.IsNullOrWhiteSpace(name) || name.Length > 120 || email.Length > 254 ||
                !new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(email)) throw new ArgumentException("Revisa el nombre, correo y rol.");
            email = email.Trim().ToLowerInvariant();
            if (users.Any(u => u.Id != id && u.Email == email)) throw new ArgumentException("Ya existe una cuenta con ese correo.");
            if (current is null && string.IsNullOrEmpty(password) || password is not null && (password.Length < 8 || password.Length > 128))
                throw new ArgumentException("La contraseña debe tener entre 8 y 128 caracteres.");
            sellerCodes = sellerCodes.Select(s => s.Trim()).Where(s => s.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            if (role == "Ejecutivo" && sellerCodes.Length == 0) throw new ArgumentException("Asigna al menos una clave de vendedor al ejecutivo.");
            if (current?.Role == "Administrador" && (!active || role != "Administrador") && users.Count(u => u.Active && u.Role == "Administrador") == 1)
                throw new ArgumentException("Debe quedar al menos un administrador activo.");
            var user = new AccessUser(current?.Id ?? Guid.NewGuid(), name.Trim(), email, role, role == "Ejecutivo" ? sellerCodes : [], active,
                current?.PasswordHash ?? "", (current?.Version ?? 0) + 1);
            if (password is not null) user = user with { PasswordHash = hasher.HashPassword(user, password) };
            if (current is null) users.Add(user); else users[users.FindIndex(u => u.Id == id)] = user;
            await SaveAsync(); return View(user);
        }
        finally { gate.Release(); }
    }
    private async Task SaveAsync()
    { await File.WriteAllTextAsync(path + ".tmp", JsonSerializer.Serialize(users)); File.Move(path + ".tmp", path, true); }
    public static ClaimsPrincipal Principal(AccessUser user) => new(new ClaimsIdentity([
        new(ClaimTypes.NameIdentifier, user.Id.ToString()), new(ClaimTypes.Name, user.Name),
        new(ClaimTypes.Email, user.Email), new(ClaimTypes.Role, user.Role), new("version", user.Version.ToString()),
        .. user.SellerCodes.Select(code => new Claim("seller", code))
    ], "Cookies"));
}
