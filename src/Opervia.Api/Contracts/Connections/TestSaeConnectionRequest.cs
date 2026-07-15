using System.ComponentModel.DataAnnotations;

namespace Opervia.Api.Contracts.Connections;

public sealed class TestSaeConnectionRequest
{
    [Required(ErrorMessage = "El nombre de la conexión es obligatorio.")]
    [StringLength(120, MinimumLength = 2)]
    public string DisplayName { get; init; } = string.Empty;

    [Required(ErrorMessage = "El servidor o dirección IP es obligatorio.")]
    [StringLength(255)]
    public string Host { get; init; } = string.Empty;

    [Range(1, 65535, ErrorMessage = "El puerto debe estar entre 1 y 65535.")]
    public int Port { get; init; } = 3050;

    [Required(ErrorMessage = "La ruta o alias de la base es obligatorio.")]
    [StringLength(500)]
    public string Database { get; init; } = string.Empty;

    [Required(ErrorMessage = "El usuario de Firebird es obligatorio.")]
    [StringLength(100)]
    public string Username { get; init; } = string.Empty;

    [Required(ErrorMessage = "La contraseña de Firebird es obligatoria.")]
    [StringLength(255)]
    public string Password { get; init; } = string.Empty;

    [Required(ErrorMessage = "El número de empresa es obligatorio.")]
    [RegularExpression(
        @"^[0-9]+$",
        ErrorMessage = "El número de empresa debe contener solamente dígitos."
    )]
    public string CompanyNumber { get; init; } = string.Empty;

    [Required]
    [StringLength(30)]
    public string SaeVersion { get; init; } = "10";

    [Required]
    [StringLength(30)]
    public string Charset { get; init; } = "UTF8";
}
