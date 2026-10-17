import { useSearchParams } from 'react-router-dom';
import AccountFrame from './AccountFrame.jsx';
import AccountTabs from './AccountTabs.jsx';
import AiShopping from './AiShopping.jsx';
import AiMirror from './AiMirror.jsx';
import { AI_DEFAULT_TAB, AI_TABS } from './accountNavModel.js';

const TAB_IDS = AI_TABS.map((tab) => tab.id);

/**
 * The AI Atelier: the shopping companion and the mirror as tabs of one page.
 * The `?tab=` query picks the tab, so each tab keeps a stable URL; an unknown
 * value falls back to the shopping tab rather than a blank page. Each tab
 * renders its page's own content — nothing is rewritten, only framed.
 */
export default function AiAtelier() {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const activeId = TAB_IDS.includes(requested) ? requested : AI_DEFAULT_TAB;

  return (
    <AccountFrame
      breadcrumbItems={[{ label: 'Account', to: '/account' }, { label: 'AI Atelier' }]}
      label="PRATIKSHYA AI"
      title="AI Atelier"
    >
      <AccountTabs label="AI Atelier sections" tabs={AI_TABS} activeId={activeId} />
      {activeId === 'shopping' && <AiShopping embedded />}
      {activeId === 'mirror' && <AiMirror embedded />}
    </AccountFrame>
  );
}
