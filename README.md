# Rêvemor

YouTube benzeri Rêvemor video platformu. Backend'i Node.js/Express ile çalışır.

## ÖNEMLİ

Bu proje **GitHub Pages üzerinde tek başına çalışmaz**. GitHub Pages yalnızca statik HTML/CSS/JS yayınlar; Rêvemor'un hesap, e-posta doğrulama, admin, kanal, takip, ban ve video yükleme özellikleri Node.js sunucusu gerektirir.

GitHub deposunu kodu saklamak için kullanabilir, Node.js uygulamasını ise Render, Railway, Fly.io veya bir VPS gibi Node.js çalıştıran bir serviste yayınlayabilirsin.

## GitHub'a yükleme

1. GitHub'da `revemor` adlı yeni bir repository oluştur.
2. Bu klasördeki dosyaları repository'nin köküne yükle.
3. `.env` dosyasını GitHub'a **yükleme**.
4. `node_modules` klasörünü GitHub'a yükleme.
5. Hosting servisinde `.env` değişkenlerini Environment Variables bölümünden tanımla.

## Yerelde çalıştırma

```bat
npm install
copy .env.example .env
notepad .env
npm start
```

Site:
`http://localhost:3000`

Admin:
`http://localhost:3000/admin`

## Güvenlik

- `.env` gizlidir.
- Admin şifresini GitHub'a koyma.
- `data/db.json` içindeki gerçek kullanıcı verilerini GitHub'a koyma.
- Üretimde HTTPS kullan.
- Node.js 12 EOL olduğu için internete açık kullanımda güncel LTS Node.js kullanılması önerilir.

## GitHub Pages

Eğer sadece tanıtım sayfası yayınlamak istiyorsan `public/` klasöründeki statik dosyalar ayrı bir Pages projesinde kullanılabilir. Ancak gerçek Rêvemor uygulamasının API adresi Node.js sunucusuna yönlendirilmelidir.
