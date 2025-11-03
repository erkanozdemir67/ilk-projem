const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { basename } = require('path');
const mime = require('mime-types');

// Sabit Tanımlamalar
const PRODUCT_ID = "d2116419-0335-486b-a982-4702ae0a20b4";
const IKAS_TOKEN = 'mcp_3EbXLxPx98dNs6XxKO9JOUFkaiQU4YveI6P5q17aIm2j77CDEPx4z6qUMIwZOmWk8b0786c7acda49c18ff4778b438e2450';
const IKAS_API_URL = 'https://api.myikas.com/api/v1/admin/graphql';

// KRİTİK: Lütfen bu dosya yolunu kendi yerel dosyanızın tam yolu ile DEĞİŞTİRİN.
const LOCAL_IMAGE_PATH = "C:\\Users\\Acer\\Desktop\\siteye yuklenecek\\ABL7590.jpg";

// 🔥 EN GÜNCEL VE DOĞRU OLMA İHTİMALİ EN YÜKSEK REST UÇ NOKTASI
const IKAS_UPLOAD_URL = 'https://api.myikas.com/api/v1/admin/files';

// Güncellenecek Yeni Alanlar
const NEW_DATA = {
description: "kaşıntı yapmaz çelik ürün",
googleTaxonomyId: "198",
metaData: {
description: "çelik ürün grubundadır"
}
};

/**
* iKAS API'ye GraphQL isteği gönderen genel fonksiyon (Çekme ve Güncelleme için).
*/
async function sendGraphQLRequest(query, variables = {}) {
console.log("-> [DEBUG] GraphQL isteği hazırlanıyor...");

const config = {
method: 'POST',
url: IKAS_API_URL,
headers: {
'Content-Type': 'application/json',
'Authorization': `Bearer ${IKAS_TOKEN}`
},
data: { query, variables }
};

try {
const response = await axios(config);

if (response.data && response.data.errors) {
const errorMessages = response.data.errors.map(err =>
`${err.message} (Path: ${err.path ? err.path.join('.') : 'N/A'})`
).join('\n');

throw new Error(`GraphQL Hataları:\n${errorMessages}`);
}

console.log("-> [DEBUG] İstek başarılı (HTTP 200).");
return response.data.data;
} catch (error) {
if (error.response) {
const { status, data } = error.response;
console.error(`-> [DEBUG] HTTP Hata Kodu: ${status}`);
if (typeof data === 'string' && data.toLowerCase().includes('cloudflare')) {
throw new Error(`HTTP ${status} - Güvenlik Duvarı Engeli (Cloudflare): API isteği engellendi. Yanıt: ${data.substring(0, 200)}...`);
}
if (data && data.errors) {
const errorMessages = data.errors.map(err =>
`${err.message} (Path: ${err.path ? err.path.join('.') : 'N/A'})`
).join('\n');
throw new Error(`HTTP ${status} - Detaylı GraphQL Hataları:\n${errorMessages}`);
}
throw new Error(`İstek Başarısız Oldu (HTTP ${status}): ${JSON.stringify(data)}`);
} else {
throw error;
}
}
}


/**
* iKAS API'ye resmi basit REST POST ile yükler ve dönen ID'yi alır.
*/
async function uploadImageWithRest(filePath) {
console.log(`\n🖼️ REST Üzerinden Resim Yükleniyor (Uç Nokta: ${IKAS_UPLOAD_URL}): ${basename(filePath)}...`);

if (!fs.existsSync(filePath)) {
throw new Error(`Dosya bulunamadı: ${filePath}`);
}

const form = new FormData();
const fileName = basename(filePath);
const contentType = mime.lookup(filePath) || 'application/octet-stream';
form.append('file', fs.createReadStream(filePath), { filename: fileName, contentType: contentType });

try {
const config = {
method: 'POST',
url: IKAS_UPLOAD_URL,
headers: {
...form.getHeaders(),
'Authorization': `Bearer ${IKAS_TOKEN}`,
'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
'Accept': 'application/json',
'Referer': 'https://panel.myikas.com/'
},
data: form,
maxBodyLength: Infinity,
maxContentLength: Infinity,
};

const response = await axios(config);

let fileId = null;
if (Array.isArray(response.data) && response.data.length > 0) {
fileId = response.data[0].id || response.data[0].fileId;
} else if (typeof response.data === 'object' && response.data !== null) {
fileId = response.data.id || response.data.fileId;
}

if (!fileId) {
throw new Error(`Yükleme başarılı, ancak Resim ID'si ('id' veya 'fileId') API yanıtında bulunamadı. Yanıt: ${JSON.stringify(response.data)}`);
}

console.log(`✅ Resim başarıyla yüklendi. Resim ID: ${fileId}`);
return fileId;

} catch (error) {
console.error(`❌ Resim yüklenirken kritik hata oluştu.`);
if (error.response) {
const { status, data } = error.response;
console.error(`-> HTTP Hata Kodu: ${status}`);
if (typeof data === 'string' && data.toLowerCase().includes('cloudflare')) {
console.error(`-> Güvenlik Engeli (Cloudflare): API isteği muhtemelen bir güvenlik duvarı tarafından engellendi.`);
console.error(`-> Yanıt Başlangıcı: ${data.substring(0, 200)}...`);
} else {
console.error(`-> Sunucu Yanıtı: ${JSON.stringify(data)}`);
}
} else {
console.error(`-> Teknik Hata Mesajı: ${error.message}`);
}
throw new Error("Resim yükleme işlemi başarısız oldu.");
}
}


/**
* iKAS API'den temel verileri çeken sorgu.
*/
function getProductQuery(productId) {
return `
query GetProduct {
listProduct(id: {eq: "${productId}"}) {
data {
id
name
type
metaData { id slug pageTitle }
categories { id name }
tags { id name }
variants {
id sku isActive
prices { sellPrice currencyCode priceListId }
images { imageId isMain }
}
salesChannelIds
}
}
}
`;
}

/**
* Ürünü çekme, resim yükleme ve ürünü güncelleme işlemini gerçekleştiren ana fonksiyon.
*/
async function updateProduct() {
let imageIdToUse;

// AŞAMA 1: Resmi Yükle ve ID'sini Al (YENİ REST İLE)
try {
imageIdToUse = await uploadImageWithRest(LOCAL_IMAGE_PATH);
} catch (error) {
console.error(`\n🚨 İŞLEM SONLANDIRILDI: Resim yükleme adımında hata oluştu.`);
return;
}

// AŞAMA 2: Ürün Verisini Çek (GraphQL ile)
console.log(`\n🔍 Ürün ID: ${PRODUCT_ID} için mevcut veriler çekiliyor...`);

let productData;
try {
const queryResult = await sendGraphQLRequest(getProductQuery(PRODUCT_ID));

if (!queryResult.listProduct.data || queryResult.listProduct.data.length === 0) {
console.error(`❌ Ürün ID: ${PRODUCT_ID} bulunamadı veya yetkiniz yok.`);
return;
}

productData = queryResult.listProduct.data[0];
console.log(`✅ Mevcut ürün verileri başarıyla çekildi. Ürün Adı: ${productData.name}`);
} catch (error) {
console.error("\n❌ Ürün verisi çekilirken kritik hata oluştu:");
console.error(error.message);
return;
}

// AŞAMA 3: Ürün Güncelleme Mutasyonunu Hazırla ve Gönder (GraphQL ile)
const categoryIds = (productData.categories || []).map(c => c.id);
const tagIds = (productData.tags || []).map(t => t.id);

const newImage = {
imageId: imageIdToUse,
isMain: true,
order: 0,
isVideo: false
};

const firstVariant = productData.variants[0];
const existingImages = (firstVariant.images || []).filter(img => img.imageId !== "7d4468f3-6625-4c01-a128-0902c342738d");

const updatedImages = [newImage, ...existingImages.map((img, index) => ({
imageId: img.imageId,
isMain: false,
order: index + 1,
isVideo: img.isVideo || false
}))];

const productInput = {
id: PRODUCT_ID,
name: productData.name,
type: productData.type,
description: NEW_DATA.description,
googleTaxonomyId: NEW_DATA.googleTaxonomyId,
categoryIds: categoryIds,
tagIds: tagIds,
metaData: {
id: productData.metaData ? productData.metaData.id : PRODUCT_ID,
slug: productData.metaData ? productData.metaData.slug : productData.name.toLowerCase().replace(/\s/g, '-').replace(/[^a-z0-9-]/g, ''),
description: NEW_DATA.metaData.description,
pageTitle: productData.metaData ? productData.metaData.pageTitle : productData.name,
},
variants: productData.variants.map((variant, index) => {
if (index === 0) {
return {
id: variant.id,
sku: variant.sku,
isActive: variant.isActive,
prices: variant.prices.map(price => ({
sellPrice: price.sellPrice,
currency: price.currencyCode,
priceListId: price.priceListId
})),
images: updatedImages
};
}
return {
id: variant.id,
sku: variant.sku,
isActive: variant.isActive,
prices: variant.prices.map(price => ({
sellPrice: price.sellPrice,
currency: price.currencyCode,
priceListId: price.priceListId
})),
images: variant.images
};
}),
salesChannelIds: productData.salesChannelIds,
};

const saveProductMutation = `
mutation UpdateProduct($input: ProductInput!) {
saveProduct(input: $input) {
id
name
variants { images { imageId isMain } }
}
}
`;

console.log("\n⚙️ Ürün güncelleme mutasyonu gönderiliyor...");

try {
const mutationResult = await sendGraphQLRequest(saveProductMutation, { input: productInput });

console.log("\n=============================================");
console.log("✅ Ürün başarıyla güncellendi (Resim Eklendi).");
console.log(`Yeni Ana Resim ID: ${imageIdToUse}`);
console.log(`Ürün Adı: ${mutationResult.saveProduct.name}`);
console.log("=============================================\n");

} catch (error) {
console.error("\n❌ Ürün güncellenirken kritik hata oluştu:");
console.error(error.message);
}
}

// Ana fonksiyonu başlatma
updateProduct();