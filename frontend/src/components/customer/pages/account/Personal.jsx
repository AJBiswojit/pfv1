import { useSearchParams } from 'react-router-dom';
import AccountFrame from './AccountFrame.jsx';
import AccountTabs from './AccountTabs.jsx';
import Profile from './Profile.jsx';
import Addresses from './Addresses.jsx';
import Preferences from './Preferences.jsx';
import { PERSONAL_DEFAULT_TAB, PERSONAL_TABS } from './accountNavModel.js';

const TAB_IDS = PERSONAL_TABS.map((tab) => tab.id);

/**
 * The Personal section: profile, addresses and style preferences as tabs of
 * one page. The `?tab=` query picks the tab, so each tab keeps a stable URL;
 * an unknown value falls back to the profile tab rather than a blank page.
 * Each tab renders its page's own content — nothing is rewritten, only framed.
 */
export default function Personal() {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const activeId = TAB_IDS.includes(requested) ? requested : PERSONAL_DEFAULT_TAB;

  return (
    <AccountFrame
      breadcrumbItems={[{ label: 'Account', to: '/account' }, { label: 'Personal' }]}
      label="Your account"
      title="Personal"
    >
      <AccountTabs label="Personal sections" tabs={PERSONAL_TABS} activeId={activeId} />
      {activeId === 'profile' && <Profile embedded />}
      {activeId === 'addresses' && <Addresses embedded />}
      {activeId === 'style' && <Preferences embedded />}
    </AccountFrame>
  );
}
