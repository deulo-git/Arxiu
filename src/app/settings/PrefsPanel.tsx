import { useEffect, useState } from 'react';
import type { Prefs } from '../../api.ts';
import { Icon } from '../../components/Icon.tsx';
import { useLibrary } from '../../state.tsx';

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="setting">
      <div style={{ flex: 1, minWidth: 200 }}>
        <strong>{label}</strong>
        {hint && <p className="meta">{hint}</p>}
      </div>
      <button className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
        <span />
      </button>
    </div>
  );
}

function Choice<T extends string | number>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const id = `ch-${label}`;
  return (
    <div className="setting">
      <div style={{ flex: 1, minWidth: 200 }}>
        <label htmlFor={id}>
          <strong>{label}</strong>
        </label>
        {hint && <p className="meta">{hint}</p>}
      </div>
      <select id={id} className="field" value={value} onChange={(e) => onChange((typeof value === 'number' ? Number(e.target.value) : e.target.value) as T)}>
        {options.map(([v, l]) => (
          <option key={String(v)} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

export function PrefsPanel() {
  const { prefs, updatePrefs, categories } = useLibrary();
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => void updatePrefs({ [k]: v } as Partial<Prefs>);
  const [installEvt, setInstallEvt] = useState<InstallEvent | null>(null);
  const standalone = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (e: Event) => (e.preventDefault(), setInstallEvt(e as InstallEvent));
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="panel">
        <h2>Aspecte</h2>
        <Choice
          label="Tema"
          hint="«Automàtic» segueix el mode clar o fosc del dispositiu."
          value={prefs.theme}
          options={[
            ['auto', 'Automàtic'],
            ['light', 'Clar'],
            ['dark', 'Fosc'],
          ]}
          onChange={(v) => set('theme', v)}
        />
      </section>

      <section className="panel">
        <h2>Biblioteca</h2>
        <Choice
          label="Vista per defecte"
          value={prefs.view}
          options={[
            ['grid', 'Quadrícula'],
            ['list', 'Llista'],
          ]}
          onChange={(v) => set('view', v)}
        />
        <Choice
          label="Ordre per defecte"
          value={prefs.sort}
          options={[
            ['new', 'Més recents primer'],
            ['old', 'Més antics primer'],
            ['name', 'Nom (A–Z)'],
          ]}
          onChange={(v) => set('sort', v)}
        />
        <Choice
          label="Agrupa els documents per"
          value={prefs.group}
          options={[
            ['month', 'Mes'],
            ['year', 'Any'],
            ['category', 'Categoria'],
            ['none', 'Sense agrupar'],
          ]}
          onChange={(v) => set('group', v)}
        />
        <Toggle label="Mostra les etiquetes" hint="Sota cada document." on={prefs.showTags} onChange={(v) => set('showTags', v)} />
        <Toggle label="Mostra les persones" hint="Sota cada document." on={prefs.showPeople} onChange={(v) => set('showPeople', v)} />
      </section>

      <section className="panel">
        <h2>En pujar documents</h2>
        <Toggle label="Proposa la categoria pel nom" hint="Si el nom diu «nòmina», «factura»… ja et deixa la categoria triada. Si no, t'ho preguntarà sempre." on={prefs.guessCategory} onChange={(v) => set('guessCategory', v)} />
        <Choice
          label="Categoria per defecte"
          hint="Si en tries una, sempre sortirà triada en pujar."
          value={prefs.uploadCategory}
          options={[['', 'Cap (decideixo cada vegada)'], ...categories.map((c) => [c.id, c.name] as [string, string])]}
          onChange={(v) => set('uploadCategory', v)}
        />
        <Toggle label="Neteja el nom proposat" hint="Treu l'extensió i canvia els guions baixos per espais («Contracte_Laboral» → «Contracte Laboral»)." on={prefs.tidyName} onChange={(v) => set('tidyName', v)} />
        <Toggle label="Recorda etiquetes i persones" hint="Proposa les de l'última pujada, útil per a tandes de documents de la mateixa persona." on={prefs.rememberLast} onChange={(v) => set('rememberLast', v)} />
      </section>

      <section className="panel">
        <h2>Compartir</h2>
        <Choice
          label="Durada dels enllaços"
          hint="Quant de temps funciona un enllaç temporal."
          value={prefs.shareHours}
          options={[
            [1, '1 hora'],
            [6, '6 hores'],
            [24, '24 hores'],
            [72, '3 dies'],
            [168, '7 dies'],
            [720, '30 dies'],
          ]}
          onChange={(v) => set('shareHours', v)}
        />
      </section>

      <section className="panel">
        <h2>Instal·la l'aplicació</h2>
        {standalone ? (
          <p className="ok-msg">Ja estàs fent servir l'Arxiu com a aplicació instal·lada.</p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 14 }}>
              Pots tenir l'Arxiu a la pantalla d'inici del mòbil, com una app, amb icona pròpia i a pantalla completa.
            </p>
            {installEvt ? (
              <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => installEvt.prompt()}>
                <Icon name="download" /> Instal·la
              </button>
            ) : ios ? (
              <p className="meta" style={{ fontSize: 13 }}>
                A l'iPhone/iPad: obre l'Arxiu a Safari, toca <strong>Comparteix</strong> i tria <strong>Afegeix a la pantalla d'inici</strong>.
              </p>
            ) : (
              <p className="meta" style={{ fontSize: 13 }}>
                A Android (Chrome): menú ⋮ → <strong>Instal·la l'aplicació</strong>. Cal obrir l'Arxiu amb una adreça segura (https o localhost).
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
