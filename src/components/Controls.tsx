interface LikertProps {
  value: number | undefined | null;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  labels: Record<string, string>;
  name: string;
}

export function Likert({ value, onChange, min = 1, max = 7, labels, name }: LikertProps) {
  const points = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="likert">
      <div className="likert-row" role="radiogroup" aria-label={name}>
        {points.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value === p}
            className={`likert-btn${value === p ? ' is-selected' : ''}`}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="likert-ends" style={{ gridTemplateColumns: `repeat(${points.length}, 1fr)` }}>
        {points.map((p) => (
          <span key={p}>{labels[String(p)] ?? ''}</span>
        ))}
      </div>
    </div>
  );
}

interface ChoiceProps {
  options: string[];
  value: string | number | undefined;
  onChange: (v: string) => void;
}

export function Choice({ options, value, onChange }: ChoiceProps) {
  return (
    <div className="choice-row" role="radiogroup">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          className={`choice-btn${value === o ? ' is-selected' : ''}`}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

export function Field({ label, children }: FieldProps) {
  return (
    <section className="field">
      <h3 className="field-label">{label}</h3>
      {children}
    </section>
  );
}

export function Icon({ name, size = 18 }: { name: 'note' | 'check' | 'trash' | 'close' | 'thumb' | 'alert' | 'help'; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'note':
      return (
        <svg {...common}>
          <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5v9a1.5 1.5 0 0 1-1.5 1.5H11l-4 3.5V16H6.5A1.5 1.5 0 0 1 5 14.5z" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...common}>
          <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
        </svg>
      );
    case 'thumb':
      return (
        <svg {...common}>
          <path d="M8 11v8H5v-8zM8 11l3.5-6.5c1.3 0 2 1 1.7 2.2L12.6 10H18a1.5 1.5 0 0 1 1.5 1.8l-1.2 6A1.5 1.5 0 0 1 16.8 19H8" />
        </svg>
      );
    case 'alert':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5v5.5M12 16.2v.1" />
        </svg>
      );
    case 'help':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8M12 16.6v.1" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
  }
}

interface GridProps {
  items: { id: string; text: string }[];
  scale: number;
  labels: Record<string, string>;
  values: Record<string, number>;
  onChange: (id: string, v: number) => void;
}

// 문항 × 척도 그리드 (한 화면)
export function LikertGrid({ items, scale, labels, values, onChange }: GridProps) {
  const points = Array.from({ length: scale }, (_, i) => i + 1);
  const cols = `minmax(220px, 1.6fr) repeat(${scale}, minmax(52px, 1fr))`;
  return (
    <div className="lgrid" role="table">
      <div className="lgrid-row lgrid-head" style={{ gridTemplateColumns: cols }} role="row">
        <span />
        {points.map((p) => (
          <span key={p} className="lgrid-label">
            {labels[String(p)] ?? ''}
          </span>
        ))}
      </div>
      {items.map((it) => (
        <div key={it.id} className="lgrid-row" style={{ gridTemplateColumns: cols }} role="row" aria-label={it.text}>
          <span className="lgrid-text">{it.text}</span>
          {points.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={values[it.id] === p}
              aria-label={`${it.text} ${p}`}
              className={`lgrid-btn${values[it.id] === p ? ' is-selected' : ''}`}
              onClick={() => onChange(it.id, p)}
            >
              {p}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// 무작위 순서 (Fisher-Yates)
export function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
