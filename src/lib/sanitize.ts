// Escapa texto libre antes de interpolarlo en un template de email HTML —
// sin esto, un nombre/observación con "<script>" o un link falso sale
// crudo en un correo real que recibe un cliente externo.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// Neutraliza CSV/Excel formula injection: si un texto libre (Observaciones,
// Conductor, etc.) empieza con =, +, -, @, tab o retorno de carro, Excel/
// LibreOffice puede interpretarlo como fórmula al abrir el archivo o al
// pegar la celda en otra hoja — antepone una comilla simple para forzarlo
// a texto literal, igual que hace Google Sheets/Excel al exportar CSV.
export function sanitizeSpreadsheetCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}
