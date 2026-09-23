const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const arg = process.argv[2] || 'patch';
const currentVersion = pkg.version;
const [major, minor, patch] = currentVersion.split('.').map(Number);

let newVersion = '';
if (arg === 'patch') {
  newVersion = `${major}.${minor}.${patch + 1}`;
} else if (arg === 'minor') {
  newVersion = `${major}.${minor + 1}.0`;
} else if (arg === 'major') {
  newVersion = `${major + 1}.0.0`;
} else if (/^\d+\.\d+\.\d+$/.test(arg)) {
  newVersion = arg;
} else {
  console.error(`Versão inválida: ${arg}. Use 'patch', 'minor', 'major' ou 'X.Y.Z'`);
  process.exit(1);
}

console.log(`\n🚀 Preparando release: v${currentVersion} -> v${newVersion}\n`);

// Atualiza package.json
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
console.log(`✓ package.json atualizado para v${newVersion}`);

try {
  // Commit e Tag no Git
  execSync(`git add package.json`, { stdio: 'inherit' });
  execSync(`git commit -m "chore(release): bump version to v${newVersion}"`, { stdio: 'inherit' });
  execSync(`git tag -a "v${newVersion}" -m "Release v${newVersion}"`, { stdio: 'inherit' });
  console.log(`✓ Tag v${newVersion} criada com sucesso.`);

  console.log(`\nEnviando commits e tag para o GitHub...`);
  execSync(`git push`, { stdio: 'inherit' });
  execSync(`git push --tags`, { stdio: 'inherit' });

  console.log(`\n🎉 Release v${newVersion} disparada com sucesso no GitHub!`);
  console.log(`O GitHub Actions está compilando o LoveChat.exe agora em: https://github.com/Nnayuta/NCord/actions\n`);
} catch (err) {
  console.error('\n❌ Erro durante o processo de release git:', err.message);
  process.exit(1);
}
