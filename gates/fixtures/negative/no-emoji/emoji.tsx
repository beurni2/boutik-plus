// NEGATIVE FIXTURE: an emoji in chrome — the no-emoji gate MUST fail on this
// file. Never import this. (WO-6.0 ruling ①.)
export const BadHeader = () => <Text>Accueil 🏠</Text>;
