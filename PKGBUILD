# Maintainer: cthedark
pkgname=steam-game-importer
pkgver=1.0.0
pkgrel=1
pkgdesc="Wizard-style CLI to import non-Steam games into your Steam library with artwork"
arch=('any')
url="https://github.com/YOUR_USERNAME/steam-game-importer"
license=('GPL-3.0-only')
depends=('nodejs')
makedepends=('npm')
source=("$pkgname-$pkgver.tar.gz::$url/archive/v$pkgver.tar.gz")
sha256sums=('SKIP')

build() {
  cd "$pkgname-$pkgver"
  npm install --ignore-scripts
  npm run build
}

package() {
  cd "$pkgname-$pkgver"

  # Install built app
  install -dm755 "$pkgdir/usr/lib/$pkgname"
  cp -r dist "$pkgdir/usr/lib/$pkgname/"
  cp -r node_modules "$pkgdir/usr/lib/$pkgname/"
  install -Dm644 package.json "$pkgdir/usr/lib/$pkgname/package.json"

  # Install launcher
  install -Dm755 bin/steam-game-importer "$pkgdir/usr/bin/steam-game-importer"

  # License
  install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE" 2>/dev/null || true
}
