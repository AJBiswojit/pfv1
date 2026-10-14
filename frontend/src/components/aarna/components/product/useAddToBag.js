import { useCallback } from 'react';
import { useShop } from '../../state/ShopContext.jsx';
import { useUI } from '../../state/UIContext.jsx';

export default function useAddToBag() {
  const { addToCart } = useShop();
  const { toast, openCart } = useUI();
  return useCallback(
    (product, optionValue = null, qty = 1) => {
      const label = optionValue && product.options ? `${product.options[0].name}: ${optionValue}` : null;
      const result = addToCart(product.id, label, qty);
      /* The design's shop answered locally, so its confirmation was always
         true; this port's add is the application's own and may be refused. */
      Promise.resolve(result).then((outcome) => {
        if (outcome && outcome.ok === false) return;
        toast(`${product.name} added to bag`, { label: 'View bag', onClick: openCart });
      });
      return result;
    },
    [addToCart, toast, openCart],
  );
}
