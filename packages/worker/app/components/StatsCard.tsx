type Props = {
  value: string | number;
  label: string;
};

export const StatsCard = ({ value, label }: Props) => (
  <div className="card stat-card">
    <div className="stat-value">{value}</div>
    <div className="stat-label">{label}</div>
  </div>
);
