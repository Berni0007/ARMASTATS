FROM node:22-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src

ENV NODE_ENV=production \
    PORT=8787 \
    DATA_DIR=/app/data

USER node
EXPOSE 8787
CMD ["node", "--no-warnings=ExperimentalWarning", "src/server.js"]
