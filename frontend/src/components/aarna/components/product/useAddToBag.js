import { useCallback } from 'react';
import { useShop } from '../../state/ShopContext.jsx';
import { useUI } from '../../state/UIContext.jsx';

export default function useAddToBag() {
  const { addToCart } = useShop();
  const { toast, openCart } = useUI();
  return useCallback(
    (product, optionValue = null, qty = 1) => {
      const label = optionValue && product.options ? `${product.options[0].name}: ${optionValue}` : null;
      addToCart(product.id, label, qty);
      toast(`${product.name} added to bag`, { label: 'View bag', onClick: openCart });
    },
    [addToCart, toast, openCart],
  );
}
