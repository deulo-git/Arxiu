import { api } from '../../api.ts';
import { useLibrary, useToast } from '../../state.tsx';
import { ManagePanel } from './ManagePanel.tsx';

export function CategoriesPanel() {
  const { categories, setCategories, files, reload } = useLibrary();
  const toast = useToast();
  const counts = new Map<string, number>();
  files.forEach((f) => counts.set(f.category, (counts.get(f.category) ?? 0) + 1));
  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      toast((err as Error).message, true);
      throw err;
    }
  };

  return (
    <ManagePanel
      title="Categories"
      intro="Les categories ordenen els documents (cada document en té una). Pots canviar-ne el nom, el color i l'ordre en què surten al menú."
      addLabel="Nova categoria"
      placeholder="Ex.: Cotxe, Pis, Estudis…"
      empty="Encara no hi ha categories."
      items={categories}
      counts={counts}
      fixedId="altres"
      onAdd={(name, color) =>
        guard(async () => {
          const { category } = await api.addCategory(name, color);
          setCategories((c) => [...c, category]);
          toast(`Categoria «${name}» creada`);
        })
      }
      onUpdate={(id, patch) =>
        guard(async () => {
          const { category } = await api.updateCategory(id, patch);
          setCategories((c) => c.map((x) => (x.id === id ? category : x)));
        })
      }
      onDelete={(id) =>
        guard(async () => {
          await api.deleteCategory(id);
          await reload();
          toast('Categoria eliminada');
        })
      }
      onMove={(id, dir) =>
        guard(async () => {
          const next = [...categories];
          const i = next.findIndex((c) => c.id === id);
          const j = i + dir;
          if (j < 0 || j >= next.length) return;
          [next[i], next[j]] = [next[j], next[i]];
          setCategories(next);
          await api.orderCategories(next.map((c) => c.id));
        })
      }
      deleteHint={(_i, n) => (n ? `Els ${n} documents que hi ha passaran a «Altres».` : 'No té cap document.')}
    />
  );
}

export function TagsPanel() {
  const { tags, setTags, files, reload } = useLibrary();
  const toast = useToast();
  const counts = new Map<string, number>();
  files.forEach((f) => f.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      toast((err as Error).message, true);
      throw err;
    }
  };
  return (
    <ManagePanel
      title="Etiquetes"
      intro="Les etiquetes són paraules clau lliures (#urgent, #hisenda, #garantia…). Un document en pot tenir moltes, i serveixen per cercar i filtrar."
      addLabel="Nova etiqueta"
      placeholder="Ex.: urgent, garantia, declaració…"
      empty="Encara no hi ha etiquetes. Les pots crear aquí o en pujar un document."
      items={tags}
      counts={counts}
      onAdd={(name, color) =>
        guard(async () => {
          const { item } = await api.addTag(name, color);
          setTags((t) => [...t, item].sort((a, b) => a.name.localeCompare(b.name, 'ca')));
        })
      }
      onUpdate={(id, patch) =>
        guard(async () => {
          const { item } = await api.updateTag(id, patch);
          setTags((t) => t.map((x) => (x.id === id ? item : x)).sort((a, b) => a.name.localeCompare(b.name, 'ca')));
        })
      }
      onDelete={(id) =>
        guard(async () => {
          await api.deleteTag(id);
          await reload();
          toast('Etiqueta eliminada');
        })
      }
      onMerge={(id, into) =>
        guard(async () => {
          await api.mergeTag(id, into);
          await reload();
          toast('Etiquetes fusionades');
        })
      }
      deleteHint={(_i, n) => (n ? `Es treurà dels ${n} documents que la tenen (els documents no s'esborren).` : 'No s’està fent servir.')}
    />
  );
}

export function PeoplePanel() {
  const { people, setPeople, files, reload } = useLibrary();
  const toast = useToast();
  const counts = new Map<string, number>();
  files.forEach((f) => f.people.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      toast((err as Error).message, true);
      throw err;
    }
  };
  return (
    <ManagePanel
      title="Persones relacionades"
      intro="Persones a qui afecta o pertany un document: tu, la parella, els fills, una empresa… Així pots veure de seguida tots els papers d'algú."
      addLabel="Nova persona"
      placeholder="Ex.: Anna, Pare, Empresa SL…"
      empty="Encara no hi ha persones. Les pots crear aquí o en pujar un document."
      items={people}
      counts={counts}
      withNotes
      avatar
      onAdd={(name, color, notes) =>
        guard(async () => {
          const { item } = await api.addPerson(name, color, notes);
          setPeople((p) => [...p, item].sort((a, b) => a.name.localeCompare(b.name, 'ca')));
        })
      }
      onUpdate={(id, patch) =>
        guard(async () => {
          const { item } = await api.updatePerson(id, patch);
          setPeople((p) => p.map((x) => (x.id === id ? item : x)).sort((a, b) => a.name.localeCompare(b.name, 'ca')));
        })
      }
      onDelete={(id) =>
        guard(async () => {
          await api.deletePerson(id);
          await reload();
          toast('Persona eliminada');
        })
      }
      onMerge={(id, into) =>
        guard(async () => {
          await api.mergePerson(id, into);
          await reload();
          toast('Persones fusionades');
        })
      }
      deleteHint={(_i, n) => (n ? `Es treurà dels ${n} documents on apareix (els documents no s'esborren).` : 'No s’està fent servir.')}
    />
  );
}
