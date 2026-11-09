# Imagen para Hugging Face Spaces (SDK: docker)
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Hugging Face espera la app en el puerto 7860
ENV PORT=7860
EXPOSE 7860

CMD ["node", "dist/index.js"]
