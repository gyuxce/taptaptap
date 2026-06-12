# WAVR

Sistem pencatatan transaksi NFC dan digital souvenir untuk destinasi wisata,
dibangun dengan Next.js 16, React 19, Tailwind CSS v4, dan Supabase.

## Fitur

- Terminal merchant mobile dengan Web NFC.
- Pendaftaran wisatawan dan gelang NFC dari terminal loket.
- Pembayaran, top up, pembatasan kredit, dan pencegahan double tap.
- Dashboard admin, laporan, ekspor CSV, dan realtime feed.
- Pengelolaan akun serta status merchant.
- Notifikasi WhatsApp melalui Fonnte.
- Dukungan instalasi PWA.

## Persyaratan

- Node.js 20 atau lebih baru.
- Proyek Supabase aktif.
- Browser Android berbasis Chromium untuk Web NFC.
- HTTPS untuk pemindaian NFC di production.
- Token Fonnte bila notifikasi WhatsApp digunakan.

## Instalasi

```bash
git clone https://github.com/gyuxce/taptaptap.git
cd taptaptap
npm ci
Copy-Item .env.example .env.local
```

Isi `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FONNTE_TOKEN=your-fonnte-token
APP_ENV=development
OBSERVABILITY_WEBHOOK_URL=
```

Semua variabel Supabase wajib. Aplikasi tidak memiliki mode demo atau fallback
localStorage.

## Database

1. Jalankan [schema.sql](./schema.sql) melalui Supabase SQL Editor.
2. Buat user administrator melalui Supabase Auth.
3. Tambahkan profil administrator:

```sql
INSERT INTO public.profiles (id, role, merchant_id, merchant_type)
VALUES ('UUID_USER_ADMIN', 'admin', null, null);
```

## Menjalankan Aplikasi

```bash
npm run dev
```

Akses melalui `http://localhost:3000`.

Untuk menguji dari HP pada Wi-Fi yang sama:

```bash
npm run dev:network
```

Buka `http://IP-LAPTOP:3000` dari HP. `localhost` pada HP menunjuk ke HP itu
sendiri. Cari alamat laptop dengan `ipconfig` dan pastikan Windows Firewall
mengizinkan Node.js pada jaringan Private.

Web NFC hanya tersedia dalam secure context. `localhost` dianggap aman untuk
pengembangan, tetapi akses melalui IP LAN biasanya tidak dapat menggunakan NFC.
Gunakan deployment HTTPS untuk pengujian NFC pada perangkat nyata.

## Verifikasi

```bash
npm run lint
npm test
npm run build
```

## Staging dan Production

Gunakan dua project Supabase terpisah. Jalankan `schema.sql` lebih dulu di
staging, buat akun untuk role admin, loket, dan merchant regular, lalu lakukan:

1. Login dan redirect untuk ketiga role.
2. Registrasi gelang oleh loket.
3. Top up oleh loket dan admin.
4. Payment merchant regular, saldo tidak cukup, dan double tap.
5. Dua request payment paralel dengan UID yang sama.
6. NFC Android melalui URL HTTPS, bukan alamat IP LAN.
7. Notifikasi WhatsApp dan status `sent`/`failed`.
8. Restore backup staging sebelum production.

Set `APP_ENV=staging` pada deployment staging dan `APP_ENV=production` pada
production. Tambahkan seluruh environment variable ke platform deployment.
Jangan pernah mengekspos `SUPABASE_SERVICE_ROLE_KEY` ke client atau repository.

## Monitoring dan Backup

Server menulis structured JSON log dan menangkap uncaught request error melalui
`instrumentation.ts`. `OBSERVABILITY_WEBHOOK_URL` dapat diarahkan ke collector
log/error milik tim. Platform seperti Vercel juga dapat mengindeks output JSON
tersebut.

Aktifkan Point-in-Time Recovery Supabase untuk production. Tambahkan backup
terjadwal di luar provider, lalu uji restore secara berkala:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=wavr-$(Get-Date -Format yyyyMMdd).dump
pg_restore --clean --if-exists --dbname="$STAGING_DATABASE_URL" wavr-YYYYMMDD.dump
```

Jangan menguji restore pertama kali pada database production.
