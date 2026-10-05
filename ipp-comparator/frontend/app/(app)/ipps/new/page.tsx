'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Err, Field } from '@/components/ui';
import { SOURCE } from '@/lib/format';

export default function NewIpp() {
  const router = useRouter();
  const [f, setF] = useState<any>({ legal_name: '', brand_name: '', credit_rating: '', pan: '', gst: '', registration_no: '', states: '', address: '', notes: '' });
  const [plant, setPlant] = useState<any>({ name: '', energy_source: 'solar', state: '', installed_mw: '', available_mw: '', cuf: '' });
  const [contact, setContact] = useState<any>({ name: '', role: '', phone: '', email: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    try {
      const nz = (v: any) => (v === '' ? null : Number(v));
      const body: any = { ...f, states_served: f.states.split(',').map((s: string) => s.trim()).filter(Boolean) };
      delete body.states;
      if (plant.name) body.plants = [{ ...plant, installed_mw: nz(plant.installed_mw), available_mw: nz(plant.available_mw), cuf: nz(plant.cuf) }];
      if (contact.name) body.contacts = [contact];
      const r = await api('/ipps', { method: 'POST', body });
      router.push(`/ipps/${r.id}`);
    } catch (err: any) { setError(err.message); }
  }

  return (
    <form className="stack" onSubmit={save} style={{ maxWidth: 860 }}>
      <h1>Add IPP</h1>
      <Err msg={error} />
      <div className="card">
        <h2>Company</h2>
        <div className="form">
          <Field label="Legal name"><input required value={f.legal_name} onChange={set('legal_name')} /></Field>
          <Field label="Brand name"><input value={f.brand_name} onChange={set('brand_name')} /></Field>
          <Field label="Credit rating"><input value={f.credit_rating} onChange={set('credit_rating')} placeholder="e.g. AA" /></Field>
          <Field label="CIN / registration no."><input value={f.registration_no} onChange={set('registration_no')} /></Field>
          <Field label="PAN"><input value={f.pan} onChange={set('pan')} /></Field>
          <Field label="GST"><input value={f.gst} onChange={set('gst')} /></Field>
          <Field label="States it can serve (comma separated)" wide><input value={f.states} onChange={set('states')} placeholder="Maharashtra, Gujarat" /></Field>
          <Field label="Registered address" wide><textarea value={f.address} onChange={set('address')} /></Field>
        </div>
      </div>
      <div className="card">
        <h2>First plant (optional)</h2>
        <div className="form">
          <Field label="Plant name"><input value={plant.name} onChange={(e) => setPlant({ ...plant, name: e.target.value })} /></Field>
          <Field label="Energy source"><select value={plant.energy_source} onChange={(e) => setPlant({ ...plant, energy_source: e.target.value })}>{Object.entries(SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="State"><input required={!!plant.name} value={plant.state} onChange={(e) => setPlant({ ...plant, state: e.target.value })} /></Field>
          <Field label="Installed (MW)"><input type="number" step="any" value={plant.installed_mw} onChange={(e) => setPlant({ ...plant, installed_mw: e.target.value })} /></Field>
          <Field label="Available (MW)"><input type="number" step="any" value={plant.available_mw} onChange={(e) => setPlant({ ...plant, available_mw: e.target.value })} /></Field>
          <Field label="CUF (0 to 1)"><input type="number" step="0.01" value={plant.cuf} onChange={(e) => setPlant({ ...plant, cuf: e.target.value })} /></Field>
        </div>
      </div>
      <div className="card">
        <h2>Contact person (optional)</h2>
        <div className="form">
          <Field label="Name"><input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></Field>
          <Field label="Role"><input value={contact.role} onChange={(e) => setContact({ ...contact, role: e.target.value })} /></Field>
          <Field label="Phone"><input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
          <Field label="Email"><input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
        </div>
      </div>
      <div className="row"><button className="btn primary">Save IPP</button><button type="button" className="btn" onClick={() => router.back()}>Cancel</button></div>
    </form>
  );
}
