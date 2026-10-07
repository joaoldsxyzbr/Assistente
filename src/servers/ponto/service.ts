import type { D1Database } from "../../shared/d1.ts";
import { DomainOperationError } from "../../shared/errors.ts";

export const PUNCH_FIELDS = [
  "entrada",
  "ida_intervalo",
  "volta_intervalo",
  "saida",
] as const;

export type PunchField = (typeof PUNCH_FIELDS)[number];

export interface PontoRow {
  data: string;
  entrada: string | null;
  ida_intervalo: string | null;
  volta_intervalo: string | null;
  saida: string | null;
  criado_em?: string;
  atualizado_em?: string;
}

export interface AjusteBancoHorasRow {
  id: number;
  data: string;
  ajuste_minutos: number;
  motivo: string;
  criado_em: string;
  atualizado_em: string;
}

export interface RegisterPunchInput {
  horario: string;
  data?: string;
  marcacao?: PunchField;
}

export function todayInSaoPaulo(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function isValidTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function resolveDateRange(
  dataInicio?: string,
  dataFim?: string,
): { start: string; end: string } {
  const fallback = todayInSaoPaulo();
  const start = dataInicio ?? dataFim ?? fallback;
  const end = dataFim ?? dataInicio ?? fallback;

  if (!isValidDate(start) || !isValidDate(end) || start > end) {
    throw new DomainOperationError(
      "INVALID_DATE_RANGE",
      "Informe um intervalo de datas válido no formato AAAA-MM-DD.",
    );
  }

  const durationDays =
    (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) /
    86_400_000;
  if (durationDays > 366) {
    throw new DomainOperationError(
      "DATE_RANGE_TOO_LARGE",
      "Consulte no máximo 367 dias por chamada.",
    );
  }

  return { start, end };
}

export function choosePunchField(
  row: Pick<PontoRow, PunchField>,
  requested?: PunchField,
): PunchField | undefined {
  if (requested !== undefined) return requested;
  return PUNCH_FIELDS.find((field) => row[field] === null);
}

async function readPonto(
  db: D1Database,
  data: string,
): Promise<PontoRow | null> {
  return db
    .prepare(
      "SELECT data, entrada, ida_intervalo, volta_intervalo, saida FROM pontos WHERE data = ? LIMIT 1",
    )
    .bind(data)
    .first<PontoRow>();
}

export async function registerPunch(
  db: D1Database,
  input: RegisterPunchInput,
): Promise<{
  status:
    | "registrado"
    | "ja_registrado"
    | "campo_ocupado"
    | "dia_completo"
    | "resultado_incerto";
  data: string;
  marcacao?: PunchField;
  registro?: PontoRow;
}> {
  const data = input.data ?? todayInSaoPaulo();
  if (!isValidDate(data)) {
    throw new DomainOperationError(
      "INVALID_DATE",
      "A data precisa existir e usar o formato AAAA-MM-DD.",
    );
  }
  if (!isValidTime(input.horario)) {
    throw new DomainOperationError(
      "INVALID_TIME",
      "O horário precisa usar o formato HH:MM.",
    );
  }
  if (
    input.marcacao !== undefined &&
    !PUNCH_FIELDS.includes(input.marcacao)
  ) {
    throw new DomainOperationError("INVALID_MARK", "Campo de ponto inválido.");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readPonto(db, data);
    if (current === null) {
      const field = input.marcacao ?? "entrada";
      const insert = await db
        .prepare(
          `INSERT INTO pontos (data, ${field}) VALUES (?, ?) ON CONFLICT(data) DO NOTHING`,
        )
        .bind(data, input.horario)
        .run();

      if (insert.meta?.changes === 1) {
        const saved = await readPonto(db, data);
        if (saved?.[field] !== input.horario) {
          return { status: "resultado_incerto", data, marcacao: field, registro: saved ?? undefined };
        }
        return {
          status: "registrado",
          data,
          marcacao: field,
          registro: saved,
        };
      }
      if (insert.meta?.changes === 0) continue;
      return { status: "resultado_incerto", data, marcacao: field };
    }

    if (input.marcacao === undefined) {
      const duplicateField = PUNCH_FIELDS.find(
        (field) => current[field] === input.horario,
      );
      if (duplicateField !== undefined) {
        return {
          status: "ja_registrado",
          data,
          marcacao: duplicateField,
          registro: current,
        };
      }
    } else if (current[input.marcacao] === input.horario) {
      return {
        status: "ja_registrado",
        data,
        marcacao: input.marcacao,
        registro: current,
      };
    }

    const field = choosePunchField(current, input.marcacao);
    if (field === undefined) {
      return { status: "dia_completo", data, registro: current };
    }
    if (current[field] !== null) {
      return { status: "campo_ocupado", data, marcacao: field, registro: current };
    }

    const update = await db
      .prepare(
        `UPDATE pontos SET ${field} = ?, atualizado_em = datetime('now') WHERE data = ? AND ${field} IS NULL`,
      )
      .bind(input.horario, data)
      .run();

    if (update.meta?.changes === 1) {
      const saved = await readPonto(db, data);
      if (saved?.[field] !== input.horario) {
        return { status: "resultado_incerto", data, marcacao: field, registro: saved ?? undefined };
      }
      return {
        status: "registrado",
        data,
        marcacao: field,
        registro: saved,
      };
    }
    if (update.meta?.changes === 0) continue;
    return { status: "resultado_incerto", data, marcacao: field };
  }

  return { status: "resultado_incerto", data };
}

export async function listPunches(
  db: D1Database,
  input: { dataInicio?: string; dataFim?: string; limite?: number },
): Promise<{ registros: PontoRow[]; dataInicio: string; dataFim: string }> {
  const { start, end } = resolveDateRange(input.dataInicio, input.dataFim);
  const limit = input.limite ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new DomainOperationError("INVALID_LIMIT", "Limite inválido.");
  }

  const result = await db
    .prepare(
      "SELECT data, entrada, ida_intervalo, volta_intervalo, saida FROM pontos WHERE data BETWEEN ? AND ? ORDER BY data DESC LIMIT ?",
    )
    .bind(start, end, limit)
    .all<PontoRow>();

  return { registros: result.results ?? [], dataInicio: start, dataFim: end };
}

export async function listHourAdjustments(
  db: D1Database,
  input: { dataInicio?: string; dataFim?: string; limite?: number },
): Promise<{
  ajustes: AjusteBancoHorasRow[];
  dataInicio: string;
  dataFim: string;
}> {
  const { start, end } = resolveDateRange(input.dataInicio, input.dataFim);
  const limit = input.limite ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new DomainOperationError("INVALID_LIMIT", "Limite inválido.");
  }

  const result = await db
    .prepare(
      "SELECT id, data, ajuste_minutos, motivo, criado_em, atualizado_em FROM ajustes_banco_horas WHERE data BETWEEN ? AND ? ORDER BY data DESC, id DESC LIMIT ?",
    )
    .bind(start, end, limit)
    .all<AjusteBancoHorasRow>();

  return { ajustes: result.results ?? [], dataInicio: start, dataFim: end };
}

export async function registerHourAdjustment(
  db: D1Database,
  input: {
    data: string;
    ajusteMinutos: number;
    motivo: string;
    confirmarDuplicata?: boolean;
  },
): Promise<{
  status: "registrado" | "confirmacao_necessaria" | "resultado_incerto";
  ajuste?: AjusteBancoHorasRow;
  duplicatas?: AjusteBancoHorasRow[];
}> {
  if (!isValidDate(input.data)) {
    throw new DomainOperationError(
      "INVALID_DATE",
      "A data precisa existir e usar o formato AAAA-MM-DD.",
    );
  }
  if (
    !Number.isInteger(input.ajusteMinutos) ||
    input.ajusteMinutos === 0 ||
    Math.abs(input.ajusteMinutos) > 1440
  ) {
    throw new DomainOperationError(
      "INVALID_ADJUSTMENT",
      "O ajuste precisa ser um número inteiro de minutos, diferente de zero, entre -1440 e 1440.",
    );
  }
  const motivo = input.motivo.trim().replace(/\s+/g, " ");
  if (motivo.length === 0 || motivo.length > 250) {
    throw new DomainOperationError(
      "INVALID_REASON",
      "O motivo precisa ter entre 1 e 250 caracteres.",
    );
  }

  const rows = await db
    .prepare(
      "SELECT id, data, ajuste_minutos, motivo, criado_em, atualizado_em FROM ajustes_banco_horas WHERE data = ? ORDER BY id DESC LIMIT ?",
    )
    .bind(input.data, 1001)
    .all<AjusteBancoHorasRow>();
  const candidates = rows.results ?? [];
  if (candidates.length > 1000) {
    throw new DomainOperationError(
      "DUPLICATE_SEARCH_INCOMPLETE",
      "Há mais de 1.000 ajustes nessa data; a verificação não foi concluída e nenhum ajuste foi gravado.",
    );
  }
  const normalizedReason = motivo.toLocaleLowerCase("pt-BR");
  const duplicates = candidates.filter(
    (row) =>
      row.ajuste_minutos === input.ajusteMinutos &&
      row.motivo.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR") === normalizedReason,
  );
  if (duplicates.length > 0 && input.confirmarDuplicata !== true) {
    return { status: "confirmacao_necessaria", duplicatas: duplicates };
  }

  const inserted = await db
    .prepare(
      "INSERT INTO ajustes_banco_horas (data, ajuste_minutos, motivo) VALUES (?, ?, ?) RETURNING id, data, ajuste_minutos, motivo, criado_em, atualizado_em",
    )
    .bind(input.data, input.ajusteMinutos, motivo)
    .first<AjusteBancoHorasRow>();
  if (inserted === null) return { status: "resultado_incerto" };

  const verified = await db
    .prepare(
      "SELECT id, data, ajuste_minutos, motivo, criado_em, atualizado_em FROM ajustes_banco_horas WHERE id = ? LIMIT 1",
    )
    .bind(inserted.id)
    .first<AjusteBancoHorasRow>();
  return verified === null
    ? { status: "resultado_incerto" }
    : { status: "registrado", ajuste: verified };
}
