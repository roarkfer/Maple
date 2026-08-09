// Maple Offline: no realiza solicitudes de red.
// El ZIP fuente recibido no incluye los archivos binarios del DRAE empaquetado.
// El lector sigue funcionando offline; la definición integrada devuelve null.
export async function define(_rawWord: string): Promise<string | null> {
  return null;
}
