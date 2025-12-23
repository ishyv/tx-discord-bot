# Sistema de UI Reactivo

El bot implementa un framework de UI interno situado en `src/modules/ui`. Este sistema permite construir interfaces interactivas (Embeds, Botones, Selectores y Modales) con gestión de estado reactivo, similar a como funcionan frameworks web modernos como React o SolidJS, pero adaptado al modelo de mensajes de Discord.

## Conceptos Clave

### 1. Estado Reactivo (Signals)

En lugar de reconstruir manualmente los mensajes cada vez que un usuario interactúa, el sistema utiliza **Signales**.

- Un objeto de estado (`state`) se pasa al constructor de la UI.
- Cuando una propiedad del estado cambia, el sistema detecta el cambio y automáticamente "re-renderiza" el mensaje (actualiza el embed o los componentes).

### 2. La Clase `UI`

Es el contenedor principal de cualquier interacción compleja.

- **Constructor**: Recibe el estado inicial, una función de renderizado ("builder") y un método para enviar el mensaje.
- **Renderizado**: La función builder recibe el estado actual y debe devolver la estructura del mensaje (`embeds`, `components`). Esta función es pura: dado el mismo estado, devuelve siempre la misma visualización.

### 3. Sesiones y Ciclo de Vida

Cada vez que se envía una UI interactiva, se crea una **Sesión**.

- **Persistencia en Memoria**: Los _handlers_ de los botones y selectores se guardan en memoria (`sessions.ts`).
- **TTL (Time To Live)**: Las sesiones tienen un tiempo de vida limitado. Si el usuario no interactúa por un tiempo (ej. 15 minutos), la sesión expira para liberar memoria y los botones dejan de funcionar (o muestran un error amigable).

## Componentes Interactivos

El sistema desacopla la definición del botón de su lógica de ejecución mediante IDs deterministas o aleatorios gestionados por la sesión.

- **Botones (`Button`)**: Soportan callbacks directos `.onClick(...)`.
- **Selectores (`SelectMenu`)**: Tipados para cadenas, usuarios, roles, canales, etc.
- **Modales**: Se pueden invocar desde botones usando `.opens(modal)`.

## Ejemplo Conceptual

```typescript
// 1. Estado Inicial
const estado = { contador: 0 };

// 2. Definición de la UI
const contadorUI = new UI(
  estado,
  (state) => {
    // Esta función se ejecuta cada vez que 'state.contador' cambia

    const btnSumar = new Button().setLabel("+1").onClick("sumar", () => {
      // Al modificar el estado, se dispara una actualización automática
      state.contador++;
    });

    return {
      content: `El contador es: ${state.contador}`,
      components: [new ActionRow().addComponents(btnSumar)],
    };
  },
  (msg) => ctx.editOrReply(msg)
);

// 3. Inicio
await contadorUI.send();
```

## Beneficios del Diseño

- **Código Declarativo**: Describe _cómo debe verse_ la UI en base al estado, no _cómo cambiarla_ paso a paso.
- **Menos Boilerplate**: No es necesario gestionar coleccionistas de interacciones (`InteractionCollector`) manualmente ni preocuparse por filtrar eventos.
- **Seguridad de Tipos**: El estado está completamente tipado, evitando errores comunes al pasar datos entre interacciones.
