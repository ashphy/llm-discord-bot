const THRETSHOLD = 100;

export const snip = (text: string, threshold = THRETSHOLD): string => {
	if (text.length > threshold) {
		return `${text.slice(0, threshold)}…`;
	}
	return text;
};
