# Migrations

## 命名约定

`NNNN_<kebab-slug>.sql`,4 位 0 填充版本号,从 `0001` 起递增。

示例:
- `0001_init.sql`
- `0002_add_branch_lock_policy.sql`
- `0003_index_messages_role.sql`

## 规则

- **不可回滚**:迁移只增不删。如需回退,新增反向迁移(`NNNN_revert_xxx.sql`)。
- **可重复执行**:所有 DDL 用 `IF NOT EXISTS` 兜底,迁移本身可被多次扫描而无副作用。
- **由 `server/db/migrate.ts` 顺序应用**:已应用版本记于 `schema_migrations`,跳过已记录文件。
- **事务**:每个文件在事务中执行,失败回滚,成功才记录版本。
- **不在迁移中插入业务数据**:种子数据走独立脚本(暂未规划)。

## 命令

```bash
npm run migrate
```

读取 `server/config/getConfig.ts` 中的 `DATABASE_PATH`,扫描本目录所有 `*.sql`,按文件名排序顺序应用。
