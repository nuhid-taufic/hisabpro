FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

ENV NODE_ENV=production
EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/setupAdmin.js && node server.js"]
