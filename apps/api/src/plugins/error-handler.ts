import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { HttpError } from '../datasources/http.js';
import { NotFoundError, ValidationError } from '../services/context.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'Données invalides', code: 'validation', details: err.flatten() });
    }
    if (err instanceof ValidationError) {
      return reply.status(400).send({ error: err.message, code: err.code, details: err.details });
    }
    if (err instanceof NotFoundError) {
      return reply.status(404).send({ error: err.message, code: err.code });
    }
    if (err instanceof HttpError) {
      const status = err.isQuota ? 503 : err.isAuth ? 502 : 502;
      return reply.status(status).send({
        error: err.isQuota ? `Quota ${err.provider} dépassé ou limite de débit atteinte` : `Source ${err.provider} indisponible (HTTP ${err.status})`,
        code: err.isQuota ? 'quota' : 'upstream',
        details: { provider: err.provider, status: err.status },
      });
    }
    const e = err as { statusCode?: number; message?: string };
    const status = e.statusCode ?? 500;
    if (status >= 500) req.log.error({ err }, 'Erreur non gérée');
    return reply.status(status).send({ error: status >= 500 ? 'Erreur interne' : e.message ?? 'Erreur', code: status === 429 ? 'rate_limited' : 'internal' });
  });
}
