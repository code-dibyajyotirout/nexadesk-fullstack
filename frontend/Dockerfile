FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm install --production

COPY . .

RUN npm run build || true

EXPOSE 3000

CMD ["npm", "start"]
