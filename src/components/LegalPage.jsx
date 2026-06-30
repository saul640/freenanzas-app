import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { legalLinks, legalPolicies, SUPPORT_EMAIL, SUPPORT_MAILTO } from '../data/legalPolicies';

export default function LegalPage({ policyKey }) {
    const navigate = useNavigate();
    const params = useParams();
    const key = policyKey || params.policyKey;
    const policy = legalPolicies[key];

    if (!policy) {
        return (
            <div className="min-h-screen bg-[#f7f9f8] dark:bg-slate-900 px-6 py-10">
                <button onClick={() => navigate(-1)} className="mb-6 text-sm font-semibold text-gray-600 dark:text-slate-300 flex items-center gap-1">
                    <span className="material-symbols-rounded text-[18px]">arrow_back</span>
                    Volver
                </button>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mb-2">Documento no encontrado</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400">El documento legal solicitado no está disponible.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f7f9f8] dark:bg-slate-900 text-gray-900 dark:text-zinc-100 transition-colors duration-200">
            <header className="bg-primary text-black px-6 pt-12 pb-6 rounded-b-[2rem] shadow-sm">
                <button onClick={() => navigate(-1)} className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-black/70 hover:text-black transition-colors">
                    <span className="material-symbols-rounded text-[18px]">arrow_back</span>
                    Volver
                </button>
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-white/80 flex items-center justify-center shadow-sm shrink-0">
                        <span className="material-symbols-rounded text-[22px]">{policy.icon}</span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold tracking-tight leading-tight">{policy.title}</h1>
                        <p className="text-xs font-semibold text-black/60 mt-1">Actualizado: {policy.updatedAt}</p>
                    </div>
                </div>
            </header>

            <main className="px-6 py-6 pb-32 space-y-5">
                <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-4 shadow-sm">
                    <p className="text-sm leading-6 text-gray-600 dark:text-slate-300">{policy.intro}</p>
                </section>

                {policy.sections.map((section) => (
                    <section key={section.heading} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-4 shadow-sm">
                        <h2 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-3">{section.heading}</h2>
                        <div className="space-y-3">
                            {section.body.map((paragraph) => (
                                <p key={paragraph} className="text-sm leading-6 text-gray-600 dark:text-slate-300">{paragraph}</p>
                            ))}
                        </div>
                    </section>
                ))}

                <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-4 shadow-sm">
                    <h2 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-3">Contacto</h2>
                    <p className="text-sm leading-6 text-gray-600 dark:text-slate-300 mb-3">
                        Para preguntas, solicitudes de datos, soporte o reclamaciones, contacta a Freenanzas en:
                    </p>
                    <a href={SUPPORT_MAILTO} className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                        <span className="material-symbols-rounded text-[18px]">mail</span>
                        {SUPPORT_EMAIL}
                    </a>
                </section>

                <nav className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-4 shadow-sm">
                    <h2 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-3">Otros documentos</h2>
                    <div className="space-y-1">
                        {legalLinks
                            .filter((item) => item.path !== policy.path)
                            .map((item) => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className="flex items-center justify-between py-2 text-sm font-medium text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white"
                                >
                                    <span className="flex items-center gap-2">
                                        <span className="material-symbols-rounded text-[18px] text-gray-400">{item.icon}</span>
                                        {item.title}
                                    </span>
                                    <span className="material-symbols-rounded text-[18px] text-gray-300">chevron_right</span>
                                </Link>
                            ))}
                    </div>
                </nav>

                <p className="text-[11px] leading-5 text-gray-400 dark:text-slate-500 text-center px-2">
                    Este documento es información operativa para usuarios de Freenanzas y no sustituye asesoría legal personalizada.
                </p>
            </main>
        </div>
    );
}
