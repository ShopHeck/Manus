import { SAMPLE_PRODUCTS } from '@/data/sample';
import { Score } from '@/components/Score';
import styles from './SaturationPage.module.css';

export default function SaturationPage() {
  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Saturation Map</h1>
      <p className={styles.subtitle}>Viral Score vs. Opportunity (inverse saturation) — top-right is the goldmine</p>

      <div className={styles.matrix}>
        <div className={styles.matrixYLabel}>← High Opportunity</div>
        <div className={styles.quadrants}>
          <QuadrantLabel top="High Viral + High Opportunity" sub="Goldmine — move fast" highlight />
          <QuadrantLabel top="Low Viral + High Opportunity"  sub="Sleeping — watch and wait" />
          <QuadrantLabel top="High Viral + Low Opportunity"  sub="Crowded — hard to break in" />
          <QuadrantLabel top="Low Viral + Low Opportunity"   sub="Dead — avoid" />
        </div>
        <div className={styles.matrixXLabel}>High Viral Score →</div>
      </div>

      <div className={styles.table}>
        <table className={styles.tbl}>
          <thead>
            <tr>
              <th>Product</th>
              <th>Viral Score</th>
              <th>Opportunity</th>
              <th>Saturation</th>
              <th>Category</th>
            </tr>
          </thead>
          <tbody>
            {[...SAMPLE_PRODUCTS]
              .sort((a, b) => b.viralScore.total - a.viralScore.total)
              .map(p => (
                <tr key={p.id}>
                  <td className={styles.productName}>{p.name}</td>
                  <td><Score value={p.viralScore.total} size="sm" showRing /></td>
                  <td><Score value={100 - p.saturation.total} size="sm" showRing /></td>
                  <td><Score value={p.saturation.total} size="sm" showRing /></td>
                  <td><span className={styles.cat}>{p.category}</span></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuadrantLabel({ top, sub, highlight }: { top: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`${styles.quadrant} ${highlight ? styles.quadrantHighlight : ''}`}>
      <div className={styles.qTitle}>{top}</div>
      <div className={styles.qSub}>{sub}</div>
    </div>
  );
}
