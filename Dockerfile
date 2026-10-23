FROM node:20-alpine AS builder
WORKDIR /app

# मुख्य आणि उप-फोल्डर्सच्या पॅकेज फाइल्स कॉपी करा
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# सर्व डिपेंडन्सीज इन्स्टॉल करा
RUN npm install
RUN npm --prefix client install
RUN npm --prefix server install

# सर्व प्रोजेक्ट कोड कॉपी करा
COPY . .

# डेटाबेस मॉडेल आणि फ्रंटएंड/बॅकएंड बिल्ड करा
RUN npm run db:generate
RUN npm run build

EXPOSE 4000
CMD ["npm", "start"]
