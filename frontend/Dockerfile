FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY tsconfig.json next.config.js ./

COPY pages ./pages
COPY components ./components
COPY modules ./modules
COPY lib ./lib
COPY styles ./styles

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
