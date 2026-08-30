# Rêvemor 1.0

YouTube benzeri, siyah arka planlı ve turkuaz Rêvemor markalı bir video platformu başlangıç projesidir.

## Özellikler

- Üyelik: Hotmail / Outlook / Live / MSN adresine 6 haneli doğrulama kodu.
- Kullanıcı nickname ve şifresini daha sonra değiştirebilir.
- Nickname benzersizdir.
- Her hesap yalnızca **1 kanal** açabilir.
- Kanal adı oluşturulduktan sonra değiştirilemez.
- Kanal sahibi takipçilerini süreli veya süresiz banlayabilir.
- Banlı takipçi kanalı takip edemez ve kanal etkileşimleri kısıtlanır.
- Video yükleme ve oynatma.
- Takip et / takipten çık.
- Admin paneli: kullanıcı, kanal, video ve ban yönetimi.
- Şifreler düz metin tutulmaz; bcrypt ile hashlenir.
- Session cookie HttpOnly/SameSite kullanır.
- Giriş, kayıt ve kod doğrulama uç noktalarında rate limit vardır.
- Helmet güvenlik başlıkları.
- Video yüklemelerinde boyut ve MIME kontrolü.
- JSON veri deposu kullanıldığı için native better-sqlite3/node-gyp gerekmez.
- Node.js 12 sözdizimiyle uyumludur; optional chaining (`?.`) kullanılmaz.

## Önemli: Node.js 12

İstediğin Node.js 12.22.3 x86 sürümüyle çalışacak şekilde hazırlanmıştır. Ancak Node.js 12 artık EOL'dur ve güvenlik güncellemesi almaz. İnternete açık gerçek bir site için desteklenen güncel LTS Node.js kullanmanı öneririm.

## Kurulum (Windows CMD)

```bat
cd C:\Users\KULLANICI\Desktop\revemor
npm install
copy .env.example .env
notepad .env
npm start
```

Sonra:
- Site: http://localhost:3000
- Admin: http://localhost:3000/admin

`.env` içindeki `ADMIN_PASSWORD` değerini mutlaka değiştir.

### E-posta doğrulama

Gerçek e-posta göndermek için `.env` içine SMTP bilgilerini yaz. Microsoft/Outlook tarafında hesabın SMTP kullanımına izin vermesi ve hesabın güvenlik ayarlarının uygun olması gerekir. Çalışmazsa uygulama kayıt akışını bozmaz; kod sunucu konsoluna da yazılır (üretimde bunu kapatabilirsin).

## GitHub Pages hakkında

GitHub Pages sadece statik dosyaları barındırır; kullanıcı hesabı, şifre, e-posta kodu, admin paneli ve video yükleme gibi sunucu işlemleri için Node.js sunucusu gerekir. Bu nedenle `revemor` klasörünü bir Node.js host/VPS üzerinde çalıştırmalısın. GitHub Pages'ı yalnızca statik tanıtım sayfası için kullanabilirsin.

## Üretime almadan önce

1. HTTPS kullan.
2. Güçlü bir `SESSION_SECRET` ve admin şifresi belirle.
3. SMTP hesabı için uygulamaya özel/güvenli kimlik doğrulama yöntemini kullan.
4. JSON veri deposunu büyük trafik için PostgreSQL/MySQL gibi gerçek bir veritabanına taşı.
5. Reverse proxy (ör. Nginx) ve güvenlik duvarı kullan.
6. Video dosyalarını yerel disk yerine object storage/CDN'e taşı.

## Dosya yapısı

- `server.js` — Node.js/Express backend
- `public/` — Rêvemor arayüzü
- `public/admin.html` — admin paneli
- `data/db.json` — kullanıcı/kanal/video/follow/ban verileri
- `uploads/` — yüklenen videolar ve küçük resimler
- `.env.example` — ayar şablonu


## İlk admin hesabı

Bu paket yerel kurulum için otomatik oluşturulmuş bir admin hesabıyla gelir:

- Nickname: `revemoradmin`
- E-posta: `admin@revemor.local`
- Şifre: `Rv!XotnI6amp8O-k4nM29`

İlk girişten sonra bu hesabın şifresini değiştir. `.env` dosyası gizli tutulmalıdır ve GitHub'a yüklenmemelidir.
