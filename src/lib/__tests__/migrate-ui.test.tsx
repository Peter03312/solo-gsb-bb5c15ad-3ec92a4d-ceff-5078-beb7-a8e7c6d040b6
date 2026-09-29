import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RecalibrateMigrateDialog } from '../../components/RecalibrateMigrateDialog';
import { alignCues } from '../align';
import { defaultStateFor } from '../merge';
import { migrateStates, planMigration } from '../migrate';
import { SAMPLE_A, SAMPLE_B } from '../samples';
import { parseSrt } from '../srt';

const noop = () => {};

describe('重新校准迁移弹窗', () => {
  it('未打开时不渲染', () => {
    const html = renderToString(
      <RecalibrateMigrateDialog
        open={false}
        busy={false}
        error={null}
        oldGroupCount={0}
        newGroups={null}
        newCuesA={[]}
        newCuesB={[]}
        plan={null}
        calibrated={false}
        anchorCount={0}
        onClose={noop}
        onRetry={noop}
        onConfirm={noop}
      />,
    );
    expect(html).toBe('');
  });

  it('busy 时提示正在重新对齐，且取消按钮可用', () => {
    const html = renderToString(
      <RecalibrateMigrateDialog
        open
        busy
        error={null}
        oldGroupCount={0}
        newGroups={null}
        newCuesA={[]}
        newCuesB={[]}
        plan={null}
        calibrated
        anchorCount={4}
        onClose={noop}
        onRetry={noop}
        onConfirm={noop}
      />,
    );
    expect(html).toContain('重新对齐');
    expect(html).toContain('取消计算（保留旧工作区）');
  });

  it('busy 时文案使用发起预览时冻结的校准参数（锚点数取请求快照而非实时草稿）', () => {
    const html = renderToString(
      <RecalibrateMigrateDialog
        open
        busy
        error={null}
        oldGroupCount={0}
        newGroups={null}
        newCuesA={[]}
        newCuesB={[]}
        plan={null}
        calibrated
        anchorCount={7}
        onClose={noop}
        onRetry={noop}
        onConfirm={noop}
      />,
    );
    expect(html).toContain('按新校准（7 个锚点）');
    expect(html).not.toContain('按原始 B 时间');
  });

  it('发起预览时选择原始 B 时间，busy 文案即显示未校准（即使工作区当前已校准）', () => {
    const html = renderToString(
      <RecalibrateMigrateDialog
        open
        busy
        error={null}
        oldGroupCount={0}
        newGroups={null}
        newCuesA={[]}
        newCuesB={[]}
        plan={null}
        calibrated={false}
        anchorCount={0}
        onClose={noop}
        onRetry={noop}
        onConfirm={noop}
      />,
    );
    expect(html).toContain('按原始 B 时间');
    expect(html).not.toContain('按新校准');
  });

  it('Worker 失败时展示原因、提供重新计算，确认按钮禁用', () => {
    const html = renderToString(
      <RecalibrateMigrateDialog
        open
        busy={false}
        error="worker crashed"
        oldGroupCount={3}
        newGroups={null}
        newCuesA={[]}
        newCuesB={[]}
        plan={null}
        calibrated
        anchorCount={4}
        onClose={noop}
        onRetry={noop}
        onConfirm={noop}
      />,
    );
    expect(html).toContain('迁移预览计算失败');
    expect(html).toContain('worker crashed');
    expect(html).toContain('旧工作区保持原样');
    // 失败态仍用发起时冻结的参数描述本次预览，重试沿用同一参数
    expect(html).toContain('按新校准（4 个锚点）');
    expect(html).toContain('重新计算');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>\s*确认并一次提交/);
  });

  it('展示可迁移/歧义/无对应统计与明细，并标明一次提交、取消保留旧工作区', () => {
    const a = parseSrt(SAMPLE_A);
    const b = parseSrt(SAMPLE_B);
    const groups = alignCues(a, b);
    // 同一对齐作为“新对齐”：所有组内容一致，理论上全部可迁移
    const plan = planMigration(groups, groups, a, b);
    const html = renderToString(
      <RecalibrateMigrateDialog
        open
        busy={false}
        error={null}
        oldGroupCount={groups.length}
        newGroups={groups}
        newCuesA={a}
        newCuesB={b}
        plan={plan}
        calibrated
        anchorCount={5}
        onClose={noop}
        onRetry={noop}
        onConfirm={noop}
      />,
    );
    expect(html).toContain('重新校准并迁移审校决定');
    expect(html).toContain('按新校准（5 个锚点）');
    expect(html).toContain(`可迁移`);
    expect(html).toContain(`无对应`);
    expect(html).toContain('确认并一次提交');
    expect(html).toContain('取消（保留旧工作区）');
    expect(html).toContain('时间选择一律使用新组默认值');
  });

  it('端到端：同方案重新校准后所有已决定都能迁移，时间选择回到新默认', () => {
    const a = parseSrt(SAMPLE_A);
    const b = parseSrt(SAMPLE_B);
    const groups = alignCues(a, b);
    const plan = planMigration(groups, groups, a, b);
    expect(plan.ok).toBe(true);
    expect(plan.ambiguous).toHaveLength(0);
    const oldStates = groups.map((g) => defaultStateFor(g, a, b));
    const newBase = groups.map((g) => defaultStateFor(g, a, b));
    const out = migrateStates(groups, newBase, oldStates, plan);
    expect(out).toHaveLength(groups.length);
    // 新组默认状态都合法
    for (const s of out) {
      expect(s.resolution.time).toMatch(/^(A|B|union|custom)$/);
      expect(s.resolution.customStart).toBe('');
    }
  });
});
