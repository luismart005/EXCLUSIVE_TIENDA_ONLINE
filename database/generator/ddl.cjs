const fs = require('fs');
const path = require('path');
const wasm = require('@prisma/prisma-schema-wasm');

const schemaPath = path.resolve(__dirname, '../../packages/db/prisma/schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf8');
const dmmf = JSON.parse(wasm.get_dmmf(JSON.stringify({ prismaSchema: schema }))).datamodel;

const q = (s) => `"${s}"`;
const models = dmmf.models;
const byName = Object.fromEntries(models.map((m) => [m.name, m]));
const tableOf = (m) => m.dbName || m.name;
const colOf = (m, fieldName) => {
  const f = m.fields.find((x) => x.name === fieldName);
  return f.dbName || f.name;
};

function sqlType(f) {
  if (f.kind === 'enum') return q(f.type);
  const auto = f.default && f.default.name === 'autoincrement';
  if (auto) return f.type === 'BigInt' ? 'BIGSERIAL' : 'SERIAL';
  if (f.nativeType) {
    const [name, args] = f.nativeType;
    const up = name.toUpperCase();
    return args && args.length ? `${up}(${args.join(',')})` : up;
  }
  switch (f.type) {
    case 'String': return 'TEXT';
    case 'Int': return 'INTEGER';
    case 'BigInt': return 'BIGINT';
    case 'Boolean': return 'BOOLEAN';
    case 'DateTime': return 'TIMESTAMP(3)';
    case 'Decimal': return 'DECIMAL(65,30)';
    case 'Json': return 'JSONB';
    case 'Float': return 'DOUBLE PRECISION';
    default: throw new Error('Tipo no soportado ' + f.type);
  }
}

function sqlDefault(f) {
  if (!f.hasDefaultValue || f.default === undefined) return '';
  const d = f.default;
  if (typeof d === 'object' && d !== null && d.name) {
    if (d.name === 'autoincrement') return '';
    if (d.name === 'now') return ' DEFAULT CURRENT_TIMESTAMP';
    throw new Error('Default no soportado ' + d.name);
  }
  if (typeof d === 'boolean') return ` DEFAULT ${d}`;
  if (typeof d === 'number') return ` DEFAULT ${d}`;
  if (typeof d === 'string') {
    if (f.kind === 'enum') return ` DEFAULT '${d}'`;
    if (f.type === 'Decimal' || f.type === 'Int') return ` DEFAULT ${d}`;
    return ` DEFAULT '${d.replace(/'/g, "''")}'`;
  }
  throw new Error('Default desconocido');
}

const out = [];

for (const e of dmmf.enums) {
  out.push(`CREATE TYPE ${q(e.dbName || e.name)} AS ENUM (${e.values.map((v) => `'${v.dbName || v.name}'`).join(', ')});`);
  out.push('');
}

const indexes = dmmf.indexes;
const fks = [];

for (const m of models) {
  const t = tableOf(m);
  const lines = [];
  for (const f of m.fields) {
    if (f.kind === 'object') {
      if (f.relationFromFields && f.relationFromFields.length) {
        fks.push({ m, f });
      }
      continue;
    }
    const col = f.dbName || f.name;
    lines.push(`    ${q(col)} ${sqlType(f)}${f.isRequired ? ' NOT NULL' : ''}${sqlDefault(f)}`);
  }
  const pk = indexes.find((i) => i.model === m.name && i.type === 'id');
  const pkCols = pk.fields.map((x) => q(colOf(m, x.name))).join(',');
  const pkName = pk.dbName || `${t}_pkey`;
  out.push(`CREATE TABLE ${q(t)} (\n${lines.join(',\n')},\n\n    CONSTRAINT ${q(pkName)} PRIMARY KEY (${pkCols})\n);`);
  out.push('');
}

for (const i of indexes) {
  if (i.type === 'id') continue;
  const m = byName[i.model];
  const t = tableOf(m);
  const cols = i.fields.map((x) => colOf(m, x.name));
  const suffix = i.type === 'unique' ? 'key' : 'idx';
  const name = i.dbName || `${t}_${cols.join('_')}_${suffix}`;
  out.push(`CREATE ${i.type === 'unique' ? 'UNIQUE ' : ''}INDEX ${q(name)} ON ${q(t)}(${cols.map(q).join(', ')});`);
  out.push('');
}

const actionSql = { Cascade: 'CASCADE', Restrict: 'RESTRICT', SetNull: 'SET NULL', NoAction: 'NO ACTION', SetDefault: 'SET DEFAULT' };
for (const { m, f } of fks) {
  const t = tableOf(m);
  const target = byName[f.type];
  const fromCols = f.relationFromFields.map((n) => colOf(m, n));
  const toCols = f.relationToFields.map((n) => colOf(target, n));
  const required = f.relationFromFields.every((n) => m.fields.find((x) => x.name === n).isRequired);
  const onDelete = actionSql[f.relationOnDelete] || (required ? 'RESTRICT' : 'SET NULL');
  const name = `${t}_${fromCols.join('_')}_fkey`;
  out.push(`ALTER TABLE ${q(t)} ADD CONSTRAINT ${q(name)} FOREIGN KEY (${fromCols.map(q).join(', ')}) REFERENCES ${q(tableOf(target))}(${toCols.map(q).join(', ')}) ON DELETE ${onDelete} ON UPDATE CASCADE;`);
  out.push('');
}

process.stdout.write(out.join('\n'));
