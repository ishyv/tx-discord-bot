# Economía e Inventario

Marco de referencia para entender la lógica del sistema económico y de gestión de ítems.

## Diseño de Monedas

- **Registro de Monedas**: El bot utiliza un sistema de registro flexible que permite definir múltiples tipos de monedas. Cada moneda define sus propias reglas de validación, límites y comportamiento (ej. si permite saldos negativos o si tiene sub-saldos como banco/mano).
- **Desacoplamiento**: La lógica aritmética de cada moneda está aislada del motor de transacciones, facilitando la adición de nuevas divisas sin riesgo de afectar el núcleo económico.

## Motor de Transacciones

- **Atomicidad**: Todas las operaciones económicas se ejecutan mediante un motor de transacciones que garantiza que los cambios sean atómicos. Si una parte de la transacción falla (ej. fondos insuficientes para un costo), toda la operación se revierte.
- **Simulación Previa**: Antes de persistir cualquier cambio, el motor simula la operación para validar que el estado resultante sea legal según las reglas de la moneda.
- **Concurrencia**: Utiliza técnicas de concurrencia optimista para manejar múltiples transacciones simultáneas sobre el mismo usuario, asegurando la integridad de los saldos incluso en situaciones de alta actividad.

## Inventario de Ítems

- **Definiciones**: Los ítems se gestionan mediante definiciones estáticas que dictan su comportamiento (stack máximo, rareza, efectos).
- **Transacciones de Ítems**: Similar a la economía, la suma o resta de ítems se realiza de forma atómica. El sistema verifica la disponibilidad de espacio o cantidad antes de proceder con el cambio en la base de datos.
- **Persistencia Flexible**: Los datos de inventario y moneda se almacenan en estructuras abiertas que permiten evolucionar el formato sin necesidad de migraciones de base de datos frecuentes.

## Interacción con la IU

- Los comandos de economía e inventario actúan como simples interfaces que envían peticiones al motor. Esto asegura que todas las validaciones y reglas de negocio se apliquen de forma consistente, independientemente de si la acción proviene de un comando de chat, un botón o un sistema automático del bot.
