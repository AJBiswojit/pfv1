import { useSearchParams } from 'react-router-dom';
import AccountFrame from './AccountFrame.jsx';
import AccountTabs from './AccountTabs.jsx';
import Settings from './Settings.jsx';
import Security from './Security.jsx';
import { SETTINGS_DEFAULT_TAB, SETTINGS_TABS } from './accountNavModel.js';

const TAB_IDS = SETTINGS_TABS.map((tab) => tab.id);

/**
 * The Settings section: communication preferences and security as tabs of one
 * page. The `?tab=` query picks the tab, so each tab keeps a stable URL; an
 * unknown value falls back to the communication tab rather than a blank page.
 * Each tab renders its page's own content — nothing is rewritten, only framed.
 */
export default function SettingsArea() {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const activeId = TAB_IDS.includes(requested) ? requested : SETTINGS_DEFAULT_TAB;

  return (
    <AccountFrame
      breadcrumbItems={[{ label: 'Account', to: '/account' }, { label: 'Settings' }]}
      label="Your account"
      title="Settings"
    >
      <AccountTabs label="Settings sections" tabs={SETTINGS_TABS} activeId={activeId} />
      {activeId === 'communication' && <Settings embedded />}
      {activeId === 'security' && <Security embedded />}
    </AccountFrame>
  );
}
