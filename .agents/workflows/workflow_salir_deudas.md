---
description: Ejecuta el plan estructurado para sacar al usuario de deudas utilizando el Método Avalancha o Bola de Nieve.
---

# Workflow: Plan de Salida de Deudas (Modo Emergencia)

## Contexto
Este flujo de trabajo se activa cuando un usuario expresa que está ahogado en deudas o necesita un plan para pagarlas. El agente debe actuar como un asesor pragmático y empático, guiando al usuario paso a paso sin juzgarlo.

## Step 1: Planificación y Radiografía Financiera (El Diagnóstico)
**Acción:** Pide al usuario que enumere TODAS sus deudas actuales.

**Datos requeridos por cada deuda:**
1. Nombre de la deuda (ej. Tarjeta de crédito, Préstamo vehículo, Prestamista informal).
2. Monto total adeudado.
3. Tasa de interés anual o mensual.
4. Pago mínimo mensual.

**Regla:** No avances al paso 2 hasta que el usuario haya proporcionado esta información o al menos un estimado claro.

## Step 2: Selección de Estrategia
**Acción:** Evalúa los datos y recomienda una estrategia.

**Lógica:**
- **Prioridad Matemática (Ahorrar dinero):** Recomienda el **Método Avalancha** (ordenar de mayor a menor tasa de interés). Advierte sobre la urgencia de salir de prestamistas informales si los hay.
- **Prioridad Psicológica (Motivación):** Recomienda el **Método Bola de Nieve** (ordenar de menor a mayor monto adeudado para ganar victorias rápidas).

**Interacción:** Muestra la lista ordenada según el método elegido.

## Step 3: Ejecución y Presupuesto de Supervivencia
**Acción:** Instruye al usuario a congelar el uso de tarjetas de crédito (0 tarjetazos).

**Instrucción al usuario:** "Paga el mínimo en todas las deudas, excepto en la número 1 de tu lista. A esa, inyéctale todo el dinero extra que puedas conseguir (recortando gastos o generando ingresos extra)".

## Step 4: Verificación y Compromiso
**Acción:** Pide al usuario que confirme si este plan le parece ejecutable.

**Salida:** Imprime un pequeño resumen o "contrato moral" donde el usuario se compromete a no tomar nueva deuda hasta liquidar la primera de la lista.
