import { Link } from 'react-router';
import { LangSwitch } from '../App';
import { useLoad } from '../components/ui';
import { useI18n } from '../i18n';

/** Politique de confidentialité (Loi 25). Version officielle en français. */
export function Privacy() {
  const { t, lang } = useI18n();
  const { data } = useLoad('/public/shop');
  const shop = data?.shop_name || 'le garage';
  const contact = [data?.shop_email, data?.shop_phone].filter(Boolean).join(', ') || 'les coordonnées du garage';
  return (
    <div className="main">
      <div className="row between">
        <Link to="/">{t('app.back')}</Link>
        <LangSwitch />
      </div>
      <article className="prose" lang="fr">
        <h1>Politique de confidentialité</h1>
        {lang !== 'fr' && <p className="notice" lang={lang}>{t('privacy.note')}</p>}
        <p>
          {shop} (« nous ») offre un service de mécanique automobile à domicile. Cette politique explique quels renseignements personnels nous
          recueillons, pourquoi, avec qui nous les partageons et comment exercer vos droits, conformément à la Loi sur la protection des
          renseignements personnels dans le secteur privé (Loi 25) et à la LPRPDE.
        </p>
        <h2>Responsable de la protection des renseignements personnels</h2>
        <p>Le propriétaire du garage est responsable de la protection de vos renseignements. Pour toute question ou demande : {contact}.</p>
        <h2>Renseignements recueillis</h2>
        <p>
          Nom, téléphone, courriel, adresse du service et, si vous la partagez, la position GPS de l’endroit où se trouve le véhicule (seulement pour nous y rendre), langue préférée; renseignements sur votre véhicule (NIV, plaque, marque, modèle,
          kilométrage); photos et vidéos du véhicule; signatures; évaluations, factures et paiements; messages échangés avec nous.
        </p>
        <h2>Pourquoi nous les utilisons</h2>
        <p>
          Planifier les visites, réaliser et documenter les réparations, vous envoyer l’évaluation et obtenir votre accord, facturer,
          vous tenir informé de l’avancement et respecter nos obligations légales et fiscales. Les rappels d’entretien et les promotions ne
          sont envoyés qu’avec votre consentement, que vous pouvez retirer en tout temps (répondez « STOP » à un texto ou modifiez vos
          préférences dans votre portail).
        </p>
        <h2>Communication à des tiers</h2>
        <p>
          Nous ne vendons jamais vos renseignements. Vos données et vos photos sont hébergées dans un centre de données situé à Montréal.
          Les avis (textos et WhatsApp) sont envoyés depuis le téléphone du garage ou, selon le cas, par un fournisseur d’envoi (Twilio);
          les courriels passent par notre fournisseur de courriel. Ces messages peuvent transiter hors du Québec; nous avons évalué ces
          transferts et ne transmettons que le nécessaire. Lorsque nous demandons un prix à un fournisseur de pièces, nous ne lui
          communiquons que le véhicule et le NIV, jamais vos coordonnées.
        </p>
        <h2>Conservation</h2>
        <p>
          Les factures et pièces justificatives sont conservées 6 ans, comme l’exigent les lois fiscales. Les autres renseignements sont
          conservés tant que vous êtes client, puis supprimés ou anonymisés sur demande.
        </p>
        <h2>Vos droits</h2>
        <p>
          Vous pouvez accéder à vos renseignements et les télécharger depuis votre portail, demander leur correction, retirer votre
          consentement et demander leur suppression (sous réserve des obligations de conservation). Vous pouvez aussi porter plainte auprès
          de la Commission d’accès à l’information du Québec.
        </p>
        <h2>Sécurité</h2>
        <p>
          Accès protégé par mot de passe et liens personnels à durée limitée, chiffrement des communications, photos privées sans données de
          localisation, copies de sauvegarde quotidiennes. Tout incident de confidentialité est consigné et, s’il présente un risque de
          préjudice sérieux, déclaré à la Commission et aux personnes concernées.
        </p>
        <p className="muted small">Dernière mise à jour : octobre 2026.</p>
      </article>
    </div>
  );
}
