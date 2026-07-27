# Bricksmith Studio

Bricksmith Studio adalah sandbox LEGO 3D berbasis browser yang telah disusun ulang agar bekerja secara progresif di browser desktop dan seluler. Pengguna dapat menambah, menyeret, menumpuk, memutar, menghapus, mengimpor, dan mengekspor keping, mengikuti cetak biru, atau bermain dengan batas waktu.

## Teknologi

- HTML, CSS, dan JavaScript tanpa framework atau proses build
- Three.js r128 untuk rendering WebGL
- MediaPipe Hands untuk kontrol gestur opsional
- Netlify static hosting dan response headers

## Dukungan Browser

Pengalaman utama memerlukan WebGL dan dirancang untuk versi modern Chrome, Edge, Firefox, dan Safari. Kontrol mouse, sentuh, roda gulir, keyboard, serta pointer events memiliki fallback. Kontrol tangan bersifat opsional; bila MediaPipe, kamera, HTTPS, atau izin kamera tidak tersedia, seluruh fitur rakit tetap dapat digunakan melalui mouse dan sentuhan.

## Struktur

- `index.html` — struktur antarmuka dan pemuatan library CDN
- `assets/styles.css` — sistem visual responsif dan fallback CSS
- `assets/app.js` — scene Three.js, interaksi, preset, timer, file, dan kamera
- 
