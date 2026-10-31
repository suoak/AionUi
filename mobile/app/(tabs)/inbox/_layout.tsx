import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function InboxLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen name='index' options={{ title: t('inbox.title') }} />
      <Stack.Screen name='[id]' options={{ title: t('inbox.detailTitle'), headerBackTitle: '' }} />
    </Stack>
  );
}
