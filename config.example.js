// Copier ce fichier en config.js pour préparer votre propre installation.
// Ne jamais mettre de clé secrète ou service_role dans un fichier de navigateur.
window.CONDUITE_CONFIG = {
  collaborationEnabled: false,
  atomicCollaboration: true,
  supabaseUrl: '',
  supabasePublishableKey: '',
  appName: 'Conduite radio',
  organisation: 'Votre organisation',
  contactEmail: '',
  adminEmail: '',
  homeSubtitle: 'Créer, organiser et visualiser des conducteurs radio.',
  help: {
    Direct: 'En direct au micro', Habillage: 'Jingle, générique, virgule…',
    PAD: 'Prêt à diffuser', Appel: 'Téléphone, visio…',
    Musique: 'Morceau ou extrait musical', Promo: 'Annonce', Bloc: 'Segment de l’émission'
  }
};
