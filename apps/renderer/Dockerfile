# Image officielle Playwright : Chromium et ses dépendances système déjà installés.
FROM mcr.microsoft.com/playwright:v1.49.1-noble
ENV NODE_ENV=production
WORKDIR /app
COPY apps/renderer/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY apps/renderer/server.mjs ./
USER pwuser
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
