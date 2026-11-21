export function EmergencyContacts() {
  return (
    <section
      id="emergency-contacts"
      aria-labelledby="emergency-contacts-heading"
      className="panel-3d rounded-2xl border border-red-200/90 bg-white p-4 dark:border-red-900/70 dark:bg-slate-900"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1.5 border-b border-slate-200/80 pb-2.5 dark:border-slate-700/80">
        <h2
          id="emergency-contacts-heading"
          className="font-display text-sm font-bold text-slate-900 dark:text-white"
        >
          🚨 Números de Emergencia
        </h2>
        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
          UTFSM Casa Central Valparaíso
        </p>
      </div>

      <ul className="grid gap-2.5" role="list">
        <li className="card-3d grid gap-1.5 rounded-xl border border-red-200/80 bg-red-50/50 p-3 dark:border-red-900/60 dark:bg-slate-800/90">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">
              Central de emergencias (Casa Central Valparaíso)
            </h3>
            <span className="pill-3d rounded-full border border-red-300 bg-[#DC2626] px-2 py-0.5 text-[11px] font-bold text-white dark:border-red-700">
              🚨 Emergencias
            </span>
          </div>
          <a
            href="tel:+56322654222"
            className="btn-3d-primary inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#DC2626] px-3 py-1.5 text-xs font-bold text-white transition-all duration-150 hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626]"
          >
            <span aria-hidden="true">📞</span>
            <span>+56 32 265 4222</span>
          </a>
        </li>

        <li className="card-3d grid gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/90">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">
              Supervisor de seguridad (24/7)
            </h3>
            <span className="pill-3d rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-200">
              🛡️ 24/7
            </span>
          </div>
          <a
            href="tel:+56978771654"
            className="btn-3d inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <span aria-hidden="true">📞</span>
            <span>+569 7877 1654</span>
          </a>
        </li>

        <li className="card-3d grid gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/90">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white">
            Atención de salud Sansanito (estudiantes)
          </h3>
          <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-300">
            Lunes a viernes de 8:00 a 21:00 h; sábados de 10:00 a 12:30 h
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <a
              href="tel:+56322654639"
              className="btn-3d inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <span aria-hidden="true">📞</span>
              <span>+56 32 265 4639</span>
            </a>
            <a
              href="tel:+56973344188"
              className="btn-3d inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <span aria-hidden="true">📱</span>
              <span>+569 7334 4188</span>
            </a>
          </div>
        </li>

        <li className="card-3d grid gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/90">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white">
            Salud / Prevencionista de riesgos (profesores y funcionarios)
          </h3>
          <a
            href="tel:+56962295110"
            className="btn-3d inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <span aria-hidden="true">📞</span>
            <span>+569 6229 5110</span>
          </a>
        </li>
      </ul>
    </section>
  )
}
