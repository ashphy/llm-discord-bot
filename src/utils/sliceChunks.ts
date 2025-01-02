export const sliceChunks = (message: string): string[] => {
	return message.match(/[\s\S]{1,2000}/g) || [];
};
