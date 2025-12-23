# Configuración de Servidores

Guía sobre los sistemas que gobiernan la personalización y límites de cada servidor (guild).

## Funciones y Toggles (Features)

- **Catálogo**: El bot dispone de un catálogo de funciones (ej. economía, tickets, automod) que pueden activarse o desactivarse individualmente.
- **Gestión**: Las funciones se controlan a través del sistema centralizado de configuración (`ConfigStore`), lo que garantiza que los cambios se propaguen de forma consistente y eficiente mediante caché.
- **Middleware**: El sistema utiliza middlewares para interceptar comandos que dependen de funciones desactivadas, respondiendo al usuario con un aviso informativo en lugar de ejecutar la lógica.

## Canales Administrados

- **Canales Core**: Son canales críticos para el funcionamiento de módulos específicos (logs, tickets, sugerencias). Su configuración se centraliza para evitar referencias rotas.
- **Canales Gestionados**: El bot puede crear y gestionar canales dinámicamente. El sistema mantiene un registro de estos canales para facilitar su limpieza o actualización.
- **Saneamiento**: Incluye procesos automáticos para detectar canales borrados manualmente en Discord y limpiar sus referencias en la configuración del bot.

## Roles Gestionados y Límites

- **Gobernanza de Roles**: Permite definir políticas de uso para roles específicos del servidor.
- **Overrides**: Posibilidad de autorizar o denegar acciones de moderación específicas basándose en el rol del usuario, independientemente de sus permisos nativos.
- **Cuotas de Uso**: Implementa límites de frecuencia para evitar el spam o el uso excesivo de comandos sensibles, utilizando ventanas de tiempo deslizantes.

## Cooldowns y Protección de Spam

- **Bucket por Usuario**: Gestiona tiempos de espera individuales entre ejecuciones de comandos para evitar el abuso.
- **Middleware**: El control de cooldowns se aplica de forma transversal antes de que el comando llegue a su lógica principal, asegurando una protección uniforme en todo el bot.
