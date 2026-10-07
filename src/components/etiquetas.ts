import { EstadoCocinero, EstadoMesa, EstadoMesero } from '@/concurrency/sharedState';

// Textos y colores compartidos por las vistas. Los ids internos empiezan en 0;
// en pantalla se muestran desde 1.

export const nombreCocinero = (id: number) => `Cocinero ${id + 1}`;
export const nombreMesero = (id: number) => `Mesero ${id + 1}`;
export const nombreMesa = (mesa: number) => `Mesa ${mesa + 1}`;

const formatoEntero = new Intl.NumberFormat('es-ES');
export const formatearEntero = (n: number) => formatoEntero.format(n);
export const formatearSegundos = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
/** "1 mesa", "3 mesas": evita textos como "1 mesas" en pantalla. */
export const contar = (n: number, singular: string, plural: string) => `${formatearEntero(n)} ${n === 1 ? singular : plural}`;

/** Tonos de estado: neutro, espera, trabajo, sincronización, listo y falla. */
export const TONOS = {
  neutro: 'bg-muted text-muted-foreground ring-foreground/10',
  espera: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  trabajo: 'bg-sky-50 text-sky-800 ring-sky-600/25',
  sincronia: 'bg-violet-50 text-violet-800 ring-violet-600/25',
  listo: 'bg-emerald-50 text-emerald-800 ring-emerald-600/25',
  falla: 'bg-destructive/10 text-destructive ring-destructive/30',
} as const;
export type Tono = keyof typeof TONOS;

export const ESTADO_COCINERO: Record<EstadoCocinero, { texto: string; tono: Tono }> = {
  [EstadoCocinero.INICIANDO]: { texto: 'Preparándose', tono: 'neutro' },
  [EstadoCocinero.ESPERANDO_FOGON]: { texto: 'Esperando fogón', tono: 'espera' },
  [EstadoCocinero.COCINANDO]: { texto: 'Cocinando en fogón', tono: 'trabajo' },
  [EstadoCocinero.ESPERANDO_HORNO]: { texto: 'Esperando horno', tono: 'espera' },
  [EstadoCocinero.HORNEANDO]: { texto: 'Horneando', tono: 'trabajo' },
  [EstadoCocinero.EMPLATANDO]: { texto: 'Emplatando', tono: 'trabajo' },
  [EstadoCocinero.ESPERANDO_BARRERA]: { texto: 'Esperando en la barrera', tono: 'sincronia' },
  [EstadoCocinero.TERMINADO]: { texto: 'Terminó su turno', tono: 'listo' },
};

export const ESTADO_MESERO: Record<EstadoMesero, { texto: string; tono: Tono }> = {
  [EstadoMesero.INICIANDO]: { texto: 'Preparándose', tono: 'neutro' },
  [EstadoMesero.DURMIENDO]: { texto: 'Durmiendo hasta que suene la campana', tono: 'sincronia' },
  [EstadoMesero.CONSULTANDO]: { texto: 'Consultando sin parar (espera ocupada)', tono: 'falla' },
  [EstadoMesero.LLEVANDO]: { texto: 'Llevando', tono: 'trabajo' },
  [EstadoMesero.TERMINADO]: { texto: 'Terminó su turno', tono: 'listo' },
};

export const ESTADO_MESA: Record<EstadoMesa, { texto: string; tono: Tono }> = {
  [EstadoMesa.EN_COCINA]: { texto: 'En cocina', tono: 'neutro' },
  [EstadoMesa.LISTA]: { texto: 'Lista, esperando mesero', tono: 'espera' },
  [EstadoMesa.EN_CAMINO]: { texto: 'En camino', tono: 'trabajo' },
  [EstadoMesa.SERVIDA]: { texto: 'Servida', tono: 'listo' },
  [EstadoMesa.SERVIDA_INCOMPLETA]: { texto: 'Servida incompleta', tono: 'falla' },
};
