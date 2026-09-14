import type { PortfolioHistoryPoint, PortfolioView } from '@tpm/shared';
import { http } from './http.js';

/** Lecture seule : il n'existe aucune route d'écriture vers Kraken. */
export const portfolioApi = {
  view: () => http.get<PortfolioView>('/portfolio'),
  refresh: () => http.post<PortfolioView>('/portfolio/refresh'),
  history: (days: number) => http.get<PortfolioHistoryPoint[]>(`/portfolio/history?days=${days}`),
};
