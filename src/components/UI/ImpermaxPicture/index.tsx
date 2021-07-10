
import * as React from 'react';

import ImpermaxImage, { Props as ImpermaxImageProps } from 'components/UI/ImpermaxImage';

interface CustomProps {
  images:
    Array<{
      type: string;
      path: string;
    }>
}

const ImpermaxPicture = ({
  images,
  ...rest
}: CustomProps & Omit<ImpermaxImageProps, 'src'>): JSX.Element => (
  <picture>
    {images.map(image => (
      <source
        key={image.path}
        type={image.type}
        srcSet={image.path} />
    ))}
    <ImpermaxImage
      width={64}
      height={64}
      src={images[images.length - 1].path}
      {...rest} />
  </picture>
);

export default ImpermaxPicture;
